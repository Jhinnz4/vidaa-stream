// Profiles (Netflix-style) on one Stremio account. Stored on the TV.
// The owner profile is the Stremio account itself (progress + "Ma liste"
// sync with every Stremio app); other profiles keep their own data here.
var Profiles = (function () {
    'use strict';

    var KEY = 'profiles', CUR = 'currentProfile', MAX = 6;
    var DEFAULT_PREFS = { preferFrench: true, quality: '1080p', hideBad: false, subsDefault: 'off', homeRows: null };

    // ── Avatars: drawn in SVG (no network, sharp at any size) ──
    var AV = [
        ['#7b5cff', 'dot', 'smile', 'none'], ['#ff5c8a', 'happy', 'grin', 'blush'],
        ['#2fb87a', 'big', 'smile', 'none'], ['#f5a623', 'dot', 'o', 'ears'],
        ['#3a6df0', 'dot', 'smile', 'glasses'], ['#e0565b', 'wink', 'grin', 'none'],
        ['#00b8d9', 'happy', 'cat', 'ears'], ['#a259ff', 'big', 'o', 'blush'],
        ['#ff7a45', 'dot', 'cat', 'blush'], ['#5cc96b', 'happy', 'smile', 'glasses'],
        ['#f2c94c', 'big', 'grin', 'ears'], ['#6c7a89', 'wink', 'smile', 'none']
    ];

    function avatarSvg(i) {
        var a = AV[((i % AV.length) + AV.length) % AV.length];
        var ink = '#1b1b2b', s = [];
        s.push('<rect width="100" height="100" rx="18" fill="' + a[0] + '"/>');
        if (a[3] === 'ears') s.push('<path d="M14 30 L24 6 L38 22Z M86 30 L76 6 L62 22Z" fill="' + ink + '" opacity=".25"/>');
        var eyes = {
            dot: '<circle cx="35" cy="44" r="6" fill="' + ink + '"/><circle cx="65" cy="44" r="6" fill="' + ink + '"/>',
            happy: '<path d="M27 46 q8 -10 16 0 M57 46 q8 -10 16 0" stroke="' + ink + '" stroke-width="5" fill="none" stroke-linecap="round"/>',
            big: '<circle cx="35" cy="43" r="10" fill="#fff"/><circle cx="65" cy="43" r="10" fill="#fff"/><circle cx="37" cy="45" r="5" fill="' + ink + '"/><circle cx="67" cy="45" r="5" fill="' + ink + '"/>',
            wink: '<circle cx="35" cy="44" r="6" fill="' + ink + '"/><path d="M57 45 h16" stroke="' + ink + '" stroke-width="5" stroke-linecap="round"/>'
        }[a[1]];
        s.push(eyes);
        var mouth = {
            smile: '<path d="M32 63 q18 16 36 0" stroke="' + ink + '" stroke-width="5" fill="none" stroke-linecap="round"/>',
            grin: '<path d="M30 60 h40 a20 20 0 0 1 -40 0z" fill="' + ink + '"/><path d="M36 60 h28 v5 h-28z" fill="#fff"/>',
            o: '<circle cx="50" cy="68" r="7" fill="' + ink + '"/>',
            cat: '<path d="M36 64 q7 8 14 0 q7 8 14 0" stroke="' + ink + '" stroke-width="5" fill="none" stroke-linecap="round"/>'
        }[a[2]];
        s.push(mouth);
        if (a[3] === 'blush') s.push('<ellipse cx="24" cy="60" rx="7" ry="4" fill="#fff" opacity=".45"/><ellipse cx="76" cy="60" rx="7" ry="4" fill="#fff" opacity=".45"/>');
        if (a[3] === 'glasses') s.push('<g stroke="' + ink + '" stroke-width="4" fill="none"><rect x="21" y="32" width="26" height="22" rx="6"/><rect x="53" y="32" width="26" height="22" rx="6"/><path d="M47 42 h6"/></g>');
        return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' + s.join('') + '</svg>';
    }

    var srcCache = {};
    function avatarSrc(i) {
        if (!srcCache[i]) srcCache[i] = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(avatarSvg(i));
        return srcCache[i];
    }

    // ── Storage ──
    var list = U.store.get(KEY, null);

    function save() { U.store.set(KEY, list); }

    function ensure() {
        if (list && list.length) return list;
        // First run: one owner profile, carrying over the old global settings.
        var prefs = {};
        Object.keys(DEFAULT_PREFS).forEach(function (k) { prefs[k] = U.store.get(k, DEFAULT_PREFS[k]); });
        list = [{ id: 'p1', name: 'Moi', avatar: 0, owner: true, prefs: prefs, items: [], searches: [] }];
        save();
        U.store.set(CUR, 'p1');
        return list;
    }

    function byId(id) {
        for (var i = 0; i < (list || []).length; i++) if (list[i].id === id) return list[i];
        return null;
    }

    function current() {
        ensure();
        return byId(U.store.get(CUR, null)) || list[0];
    }

    function select(id) { if (byId(id)) U.store.set(CUR, id); }

    function add(fields) {
        ensure();
        if (list.length >= MAX) return null;
        var p = { id: 'p' + Date.now(), name: fields.name, avatar: fields.avatar || 0, owner: false,
            prefs: JSON.parse(JSON.stringify(current().prefs || DEFAULT_PREFS)), items: [], searches: [] };
        list.push(p);
        save();
        return p;
    }

    function update(id, fields) {
        var p = byId(id);
        if (!p) return;
        for (var k in fields) if (fields.hasOwnProperty(k)) p[k] = fields[k];
        save();
    }

    function remove(id) {
        var p = byId(id);
        if (!p || p.owner) return;
        list.splice(list.indexOf(p), 1);
        save();
        if (U.store.get(CUR, null) === id) U.store.set(CUR, list[0].id);
    }

    function prefs() {
        var p = current().prefs || {}, out = {};
        Object.keys(DEFAULT_PREFS).forEach(function (k) { out[k] = p.hasOwnProperty(k) ? p[k] : DEFAULT_PREFS[k]; });
        return out;
    }

    function setPref(k, v) {
        var p = current();
        p.prefs = p.prefs || {};
        p.prefs[k] = v;
        save();
    }

    function addSearch(q) {
        q = (q || '').trim();
        if (q.length < 2) return;
        var p = current();
        p.searches = [q].concat((p.searches || []).filter(function (x) { return x.toLowerCase() !== q.toLowerCase(); })).slice(0, 8);
        save();
    }

    return {
        ensure: ensure, list: function () { return ensure(); }, current: current, select: select,
        add: add, update: update, remove: remove, save: save, byId: byId,
        prefs: prefs, setPref: setPref, addSearch: addSearch,
        avatarSrc: avatarSrc, AVATARS: AV.length, MAX: MAX
    };
})();
