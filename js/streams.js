// Stream list intelligence: what the TV can play, which languages a release
// carries, and an order that puts "will play, in French, instantly" first.
var Streams = (function () {
    'use strict';

    var FLAGS = {
        '🇫🇷': 'fr', '🇧🇪': 'fr', '🇨🇦': 'fr', '🇬🇧': 'en', '🇺🇸': 'en', '🇪🇸': 'es', '🇲🇽': 'es',
        '🇮🇹': 'it', '🇩🇪': 'de', '🇵🇹': 'pt', '🇧🇷': 'pt', '🇷🇺': 'ru', '🇺🇦': 'uk', '🇵🇱': 'pl',
        '🇯🇵': 'ja', '🇰🇷': 'ko', '🇨🇳': 'zh', '🇹🇼': 'zh', '🇮🇳': 'hi', '🇳🇱': 'nl', '🇹🇷': 'tr', '🇸🇦': 'ar'
    };
    var LANG_NAMES = { fr: 'VF', en: 'EN', es: 'ES', it: 'IT', de: 'DE', pt: 'PT', ru: 'RU', uk: 'UK',
        pl: 'PL', ja: 'JA', ko: 'KO', zh: 'ZH', hi: 'HI', nl: 'NL', tr: 'TR', ar: 'AR' };

    function textOf(s) {
        var bh = s.behaviorHints || {};
        return [s.name, s.title, s.description, bh.filename].filter(Boolean).join('\n');
    }

    function parse(s, addon, index) {
        var t = textOf(s);
        var up = t.toUpperCase();
        var bh = s.behaviorHints || {};
        var info = {
            raw: s, addon: addon, index: index,
            playable: typeof s.url === 'string' && /^https?:\/\//i.test(s.url),
            cached: null, res: '', sizeBytes: 0, langs: [], french: false, multi: false, vostfr: false,
            issues: [], compat: 'ok'
        };

        // Debrid cache state, as tagged by the addon ("[RD+]" cached, "[RD download]" not yet).
        if (/\[(RD|AD|PM|DL|TB|OC|PK|ED)\+\]|⚡/.test(t)) info.cached = true;
        else if (/\[(RD|AD|PM|DL|TB|OC|PK|ED)\s*download\]/i.test(t)) info.cached = false;

        if (/2160P|\b4K\b|\bUHD\b/.test(up)) info.res = '4K';
        else if (/1080P/.test(up)) info.res = '1080p';
        else if (/720P/.test(up)) info.res = '720p';
        else if (/480P|\bSD\b/.test(up)) info.res = '480p';

        var m = t.match(/💾\s*([\d.,]+)\s*(GB|MB|Go|Mo)/i);
        if (m) info.sizeBytes = parseFloat(m[1].replace(',', '.')) * (/^G/i.test(m[2]) ? 1e9 : 1e6);
        else if (isFinite(bh.videoSize)) info.sizeBytes = bh.videoSize;

        // Languages: flags from the addon + release-name keywords.
        var langs = {};
        Object.keys(FLAGS).forEach(function (f) { if (t.indexOf(f) !== -1) langs[FLAGS[f]] = true; });
        info.vostfr = /\bVOST(FR)?\b|\bSUBFRENCH\b/.test(up);
        if (/\b(TRUEFRENCH|FRENCH|VFF|VFQ|VFI|VF2|VOF)\b/.test(up) || /[.\s\[(]VF[.\s\])]/.test(up)) langs.fr = true;
        if (/\bMULTI\b/.test(up)) info.multi = true;
        info.langs = Object.keys(langs);
        info.french = !!langs.fr;

        // What the TV browser cannot decode (no transcoding anywhere in this chain).
        if (/\bDTS\b|DTS-HD|DTS-X|\bDTSX\b/.test(up)) info.issues.push('DTS');
        if (/TRUEHD/.test(up)) info.issues.push('TrueHD');
        if (/REMUX/.test(up)) info.issues.push('REMUX');
        if (/\bAV1\b/.test(up)) info.issues.push('AV1');
        if (/\b3D\b|\bHSBS\b|\bHOU\b/.test(up)) info.issues.push('3D');
        var dv = /\bDV\b|DOLBY.?VISION|\bDOVI\b/.test(up);
        var hdr = /HDR/.test(up);
        if (info.issues.length) info.compat = 'bad';
        else if (dv && !hdr) { info.issues.push('Dolby Vision'); info.compat = 'risk'; }
        return info;
    }

    var RES_RANK_1080 = { '1080p': 0, '4K': 1, '720p': 2, '480p': 4, '': 3 };
    var RES_RANK_4K = { '4K': 0, '1080p': 1, '720p': 2, '480p': 4, '': 3 };

    function rank(list, prefs) {
        var resRank = prefs.quality === '4K' ? RES_RANK_4K : RES_RANK_1080;
        var compatRank = { ok: 0, risk: 1, bad: 2 };
        return list.filter(function (s) {
            return s.playable && !(prefs.hideBad && s.compat === 'bad') && !isDead(s);
        }).map(function (s) {
            s.score = compatRank[s.compat] * 1000
                + (prefs.preferFrench && !s.french ? 100 : 0)
                + (s.cached === false ? 50 : 0)
                + resRank[s.res] * 5;
            return s;
        }).sort(function (a, b) { return a.score - b.score || a.index - b.index; });
    }

    function langLabel(s) {
        var l = s.langs.map(function (x) { return LANG_NAMES[x] || x.toUpperCase(); });
        if (s.multi && l.length < 2) l.push('MULTI');
        if (s.vostfr) l.push('VOSTFR');
        return l;
    }

    // First line of the addon title = release / file name.
    function title(s) {
        var raw = s.raw;
        var first = String(raw.title || raw.description || '').split('\n')[0];
        return first || (raw.behaviorHints && raw.behaviorHints.filename) || raw.name || 'Source';
    }

    // ── Dead sources ──
    // A debrid link that is gone (copyright removal, failed download…) plays a
    // ~30 s placeholder clip instead of the film. The player detects it and
    // records the source here so the list hides it next time. Not-yet-cached
    // sources ("À télécharger") are only hidden for a while: they may come back.
    var DEAD_KEY = 'deadSources';
    var TEMP_MS = 30 * 60 * 1000;

    function keyOf(s) {
        var raw = s.raw || s;
        if (raw.infoHash) return String(raw.infoHash).toLowerCase() + ':' + (raw.fileIdx || 0);
        var m = String(raw.url || '').match(/\b([a-f0-9]{40})\b/i);
        var idx = String(raw.url || '').match(/\/([a-f0-9]{40})\/[^/]*\/(\d+)\//i);
        if (m) return m[1].toLowerCase() + ':' + (idx ? idx[2] : '0');
        return String(raw.url || '');
    }

    function deadMap() {
        var map = U.store.get(DEAD_KEY, {}), now = Date.now(), changed = false;
        Object.keys(map).forEach(function (k) {
            if (map[k] && map[k] < now) { delete map[k]; changed = true; }
        });
        if (changed) U.store.set(DEAD_KEY, map);
        return map;
    }

    function markDead(s) {
        var map = deadMap();
        map[keyOf(s)] = s.cached === false ? Date.now() + TEMP_MS : 0;   // 0 = for good
        U.store.set(DEAD_KEY, map);
    }

    function isDead(s) { return deadMap().hasOwnProperty(keyOf(s)); }
    function clearDead() { U.store.del(DEAD_KEY); }
    function deadCount() { return Object.keys(deadMap()).length; }

    return { parse: parse, rank: rank, langLabel: langLabel, title: title,
        markDead: markDead, isDead: isDead, clearDead: clearDead, deadCount: deadCount };
})();
