// Subtitles are parsed and drawn by the app itself (not <track>), so they work
// the same whatever the TV browser supports. SRT and WebVTT.
var Subs = (function () {
    'use strict';

    function toSec(ts) {
        var m = ts.trim().replace(',', '.').match(/(?:(\d+):)?(\d+):(\d+(?:\.\d+)?)/);
        if (!m) return NaN;
        return (parseInt(m[1] || '0', 10) * 3600) + parseInt(m[2], 10) * 60 + parseFloat(m[3]);
    }

    function parse(text) {
        var cues = [];
        var blocks = String(text).replace(/\r/g, '').replace(/^﻿/, '').split(/\n\s*\n/);
        blocks.forEach(function (b) {
            var lines = b.split('\n');
            for (var i = 0; i < lines.length; i++) {
                var m = lines[i].match(/^\s*([\d:.,]+)\s*-->\s*([\d:.,]+)/);
                if (!m) continue;
                var body = lines.slice(i + 1).join('\n')
                    .replace(/<[^>]+>/g, '')              // <i>, <font …>, vtt tags
                    .replace(/\{\\[^}]*\}/g, '')           // ssa-style overrides
                    .trim();
                var start = toSec(m[1]), end = toSec(m[2]);
                if (body && isFinite(start) && isFinite(end)) cues.push({ start: start, end: end, text: body });
                break;
            }
        });
        cues.sort(function (a, b) { return a.start - b.start; });
        return cues;
    }

    // Cue text at time t (binary search on start, then scan back over overlaps).
    function at(cues, t) {
        var lo = 0, hi = cues.length - 1, idx = -1;
        while (lo <= hi) {
            var mid = (lo + hi) >> 1;
            if (cues[mid].start <= t) { idx = mid; lo = mid + 1; } else hi = mid - 1;
        }
        var out = [];
        for (var i = idx; i >= 0 && i > idx - 5; i--) {
            if (cues[i].end > t) out.unshift(cues[i].text);
        }
        return out.join('\n');
    }

    // Subtitle files are often Latin-1; decode as UTF-8 and fall back if it is garbage.
    function fetchText(url) {
        return fetch(url).then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.arrayBuffer();
        }).then(function (buf) {
            var txt;
            try { txt = new TextDecoder('utf-8', { fatal: true }).decode(buf); }
            catch (e) { txt = new TextDecoder('windows-1252').decode(buf); }
            return txt;
        });
    }

    var LANG = { fre: 'Français', fra: 'Français', fr: 'Français', eng: 'Anglais', en: 'Anglais',
        spa: 'Espagnol', es: 'Espagnol', ger: 'Allemand', deu: 'Allemand', de: 'Allemand',
        ita: 'Italien', it: 'Italien', por: 'Portugais', pob: 'Portugais (BR)', pt: 'Portugais',
        dut: 'Néerlandais', nld: 'Néerlandais', ara: 'Arabe', tur: 'Turc', rus: 'Russe', jpn: 'Japonais' };

    function isFrench(lang) { return /^(fre|fra|fr)(\b|-|_|$)/i.test(String(lang || '')); }
    function langName(lang) { return LANG[String(lang || '').toLowerCase()] || String(lang || '?'); }

    return { parse: parse, at: at, fetchText: fetchText, isFrench: isFrench, langName: langName };
})();
