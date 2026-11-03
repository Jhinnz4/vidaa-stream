// Stremio account API (api.strem.io / link.stremio.com) + the addon protocol
// (manifest / catalog / meta / stream / subtitles over plain HTTP JSON).
var API = (function () {
    'use strict';

    var API_URL = 'https://api.strem.io/api/';
    var LINK_URL = 'https://link.stremio.com/api/v2/';
    var CINEMETA = 'https://v3-cinemeta.strem.io/manifest.json';

    function authKey() { return U.store.get('authKey', null); }

    function call(method, body) {
        body.authKey = authKey();
        return U.fetchJson(API_URL + method, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body)
        }).then(function (r) {
            if (r && r.error) {
                var err = new Error(r.error.message || 'API error');
                err.code = r.error.code;
                throw err;
            }
            return r.result;
        });
    }

    // ── Login with a code shown on the TV (typed on link.stremio.com) ──
    function linkCreate() {
        return U.fetchJson(LINK_URL + 'create?type=Create').then(function (r) { return r.result; });
    }
    function linkRead(code) {
        return U.fetchJson(LINK_URL + 'read?type=Read&code=' + encodeURIComponent(code)).then(function (r) {
            return r && r.result && r.result.authKey ? r.result.authKey : null;
        }, function () { return null; });
    }

    // ── Addons ──
    var addons = U.store.get('addons', null);

    function loadAddons() {
        if (!authKey()) {
            return fetchManifest(CINEMETA).then(function (m) {
                addons = [{ transportUrl: CINEMETA, manifest: m }];
                return addons;
            });
        }
        return call('addonCollectionGet', { type: 'AddonCollectionGet', update: true }).then(function (res) {
            addons = (res && res.addons) || [];
            U.store.set('addons', addons);
            return addons;
        }, function (e) {
            if (e.code === 1) { logout(); throw e; }      // session gone
            if (addons) return addons;                     // offline: last known list
            throw e;
        });
    }

    function fetchManifest(url) { return U.fetchJson(url); }

    function base(addon) { return addon.transportUrl.replace(/\/manifest\.json$/, ''); }

    function supports(addon, resource, type, id) {
        var m = addon.manifest || {};
        var res = m.resources || [];
        for (var i = 0; i < res.length; i++) {
            var r = res[i];
            var name = typeof r === 'string' ? r : r.name;
            if (name !== resource) continue;
            var types = (typeof r === 'object' && r.types) || m.types || [];
            var prefixes = (typeof r === 'object' && r.idPrefixes) || m.idPrefixes;
            if (types.indexOf(type) === -1) return false;
            if (id && prefixes && prefixes.length) {
                return prefixes.some(function (p) { return id.indexOf(p) === 0; });
            }
            return true;
        }
        return false;
    }

    function extraOf(cat) {
        var list = cat.extra || [];
        var required = (cat.extraRequired || []).slice();
        list.forEach(function (e) { if (e.isRequired) required.push(e.name); });
        return { names: list.map(function (e) { return e.name; }).concat(cat.extraSupported || []), required: required };
    }

    // Catalogs shown as home rows: no required extra (search-only catalogs excluded).
    function homeCatalogs() {
        var out = [];
        (addons || []).forEach(function (a) {
            ((a.manifest && a.manifest.catalogs) || []).forEach(function (c) {
                if (!extraOf(c).required.length) out.push({ addon: a, cat: c });
            });
        });
        return out;
    }

    function searchCatalogs() {
        var out = [];
        (addons || []).forEach(function (a) {
            ((a.manifest && a.manifest.catalogs) || []).forEach(function (c) {
                if (extraOf(c).names.indexOf('search') !== -1) out.push({ addon: a, cat: c });
            });
        });
        return out;
    }

    function catalog(addon, cat, extra) {
        var url = base(addon) + '/catalog/' + cat.type + '/' + encodeURIComponent(cat.id);
        if (extra) {
            url += '/' + Object.keys(extra).map(function (k) {
                return k + '=' + encodeURIComponent(extra[k]);
            }).join('&');
        }
        return U.fetchJson(url + '.json').then(function (r) { return (r && r.metas) || []; });
    }

    function meta(type, id) {
        var list = (addons || []).filter(function (a) { return supports(a, 'meta', type, id); });
        var i = 0;
        function next() {
            if (i >= list.length) return Promise.reject(new Error('Fiche introuvable'));
            var a = list[i++];
            return U.fetchJson(base(a) + '/meta/' + type + '/' + encodeURIComponent(id) + '.json')
                .then(function (r) { if (r && r.meta) return r.meta; return next(); }, next);
        }
        return next();
    }

    // Streams from every stream addon, delivered progressively: onBatch(addon, streams).
    function streams(type, id, onBatch) {
        var list = (addons || []).filter(function (a) { return supports(a, 'stream', type, id); });
        return Promise.all(list.map(function (a) {
            return U.fetchJson(base(a) + '/stream/' + type + '/' + encodeURIComponent(id) + '.json', null, 25000)
                .then(function (r) { onBatch(a, (r && r.streams) || []); }, function () { onBatch(a, []); });
        })).then(function () { return list.length; });
    }

    function subtitles(type, id, extra) {
        var list = (addons || []).filter(function (a) { return supports(a, 'subtitles', type, id); });
        var suffix = '';
        if (extra) {
            var parts = [];
            for (var k in extra) if (extra[k] != null && extra[k] !== '') parts.push(k + '=' + encodeURIComponent(extra[k]));
            if (parts.length) suffix = '/' + parts.join('&');
        }
        return Promise.all(list.map(function (a) {
            return U.fetchJson(base(a) + '/subtitles/' + type + '/' + encodeURIComponent(id) + suffix + '.json', null, 15000)
                .then(function (r) { return (r && r.subtitles) || []; }, function () { return []; });
        })).then(function (all) { return [].concat.apply([], all); });
    }

    // ── Library (watch progress, synced with every Stremio client) ──
    var library = null;

    function loadLibrary() {
        if (!authKey()) { library = []; return Promise.resolve(library); }
        return call('datastoreGet', { collection: 'libraryItem', ids: [], all: true }).then(function (items) {
            library = items || [];
            return library;
        }, function () { library = library || []; return library; });
    }

    function libraryItem(id) {
        if (!library) return null;
        for (var i = 0; i < library.length; i++) if (library[i]._id === id) return library[i];
        return null;
    }

    function continueWatching() {
        return (library || []).filter(function (it) {
            var s = it.state || {};
            return (!it.removed || it.temp) && s.timeOffset > 0 && s.lastWatched;
        }).sort(function (a, b) {
            return new Date(b.state.lastWatched) - new Date(a.state.lastWatched);
        });
    }

    // Record progress. Existing items are copied as-is and only their
    // progress fields change, so other Stremio clients keep parsing them.
    function saveProgress(metaInfo, videoId, timeSec, durationSec) {
        if (!authKey() || !metaInfo || !isFinite(timeSec) || !isFinite(durationSec) || durationSec <= 0) return;
        var now = new Date().toISOString();
        var old = libraryItem(metaInfo.id);
        var item = old ? JSON.parse(JSON.stringify(old)) : {
            _id: metaInfo.id, name: metaInfo.name || '', type: metaInfo.type,
            poster: metaInfo.poster || null, posterShape: 'poster',
            removed: true, temp: true, _ctime: now, _mtime: now,
            state: { lastWatched: now, timeWatched: 0, timeOffset: 0, overallTimeWatched: 0,
                timesWatched: 0, flaggedWatched: 0, duration: 0, video_id: null, watched: null, noNotif: false },
            behaviorHints: { defaultVideoId: null, featuredVideoId: null, hasScheduledVideos: false }
        };
        var st = item.state || (item.state = {});
        var watchedPart = durationSec ? timeSec / durationSec : 0;
        st.lastWatched = now;
        st.video_id = videoId || metaInfo.id;
        st.duration = Math.round(durationSec * 1000);
        if (watchedPart > 0.9) {
            st.timeOffset = 0;                       // finished: drop out of "continue watching"
            if (metaInfo.type === 'movie') st.flaggedWatched = 1;
            st.timesWatched = (st.timesWatched || 0) + 1;
        } else {
            st.timeOffset = Math.round(timeSec * 1000);
        }
        item._mtime = now;
        if (old) library[library.indexOf(old)] = item; else (library || (library = [])).push(item);
        return call('datastorePut', { collection: 'libraryItem', changes: [item] }).catch(function () {});
    }

    function logout() {
        var k = authKey();
        U.store.del('authKey');
        U.store.del('addons');
        addons = null;
        library = null;
        if (k) {
            fetch(API_URL + 'logout', { method: 'POST', headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ type: 'Logout', authKey: k }) }).catch(function () {});
        }
    }

    return {
        authKey: authKey, linkCreate: linkCreate, linkRead: linkRead,
        loadAddons: loadAddons, addons: function () { return addons || []; }, supports: supports,
        homeCatalogs: homeCatalogs, searchCatalogs: searchCatalogs, catalog: catalog,
        meta: meta, streams: streams, subtitles: subtitles,
        loadLibrary: loadLibrary, libraryItem: libraryItem, continueWatching: continueWatching,
        saveProgress: saveProgress, logout: logout
    };
})();
