// Watch progress + "Ma liste" for the current profile. Same item shape as a
// Stremio libraryItem everywhere, so one code path serves both stores:
// owner profile → the Stremio account library; other profiles → stored on the TV.
var Lib = (function () {
    'use strict';

    function isOwner() { return Profiles.current().owner; }
    function items() { return isOwner() ? API.library() : (Profiles.current().items || []); }

    function item(id) {
        var all = items();
        for (var i = 0; i < all.length; i++) if (all[i]._id === id) return all[i];
        return null;
    }

    function commit(it) {
        if (isOwner()) return API.libraryPut(it);
        var p = Profiles.current();
        p.items = p.items || [];
        for (var i = 0; i < p.items.length; i++) if (p.items[i]._id === it._id) { p.items[i] = it; break; }
        if (i === p.items.length) p.items.push(it);
        Profiles.save();
        return Promise.resolve();
    }

    // Existing items are copied as-is and only the touched fields change, so
    // other Stremio clients keep parsing what we write back.
    function base(meta) {
        var old = item(meta.id);
        if (old) return JSON.parse(JSON.stringify(old));
        var now = new Date().toISOString();
        return {
            _id: meta.id, name: meta.name || '', type: meta.type,
            poster: meta.poster || null, posterShape: 'poster',
            removed: true, temp: true, _ctime: now, _mtime: now,
            state: { lastWatched: null, timeWatched: 0, timeOffset: 0, overallTimeWatched: 0,
                timesWatched: 0, flaggedWatched: 0, duration: 0, video_id: null, watched: null, noNotif: false },
            behaviorHints: { defaultVideoId: null, featuredVideoId: null, hasScheduledVideos: false }
        };
    }

    function byRecent(field) {
        return function (a, b) { return new Date(field(b) || 0) - new Date(field(a) || 0); };
    }

    // Titles removed from "continue watching" by hand: {id: lastWatched at that time}.
    // Watching again (new lastWatched) brings them back.
    function dismissKey() { return 'cwHidden_' + Profiles.current().id; }
    function dismissed(it) {
        var d = U.store.get(dismissKey(), {});
        return d.hasOwnProperty(it._id) && d[it._id] === ((it.state && it.state.lastWatched) || null);
    }
    function dismissContinue(id) {
        var it = item(id);
        if (!it) return;
        var d = U.store.get(dismissKey(), {});
        d[id] = (it.state && it.state.lastWatched) || null;
        U.store.set(dismissKey(), d);
    }

    function continueWatching() {
        return items().filter(function (it) {
            var s = it.state || {};
            return (!it.removed || it.temp) && s.timeOffset > 0 && s.lastWatched && !dismissed(it);
        }).sort(byRecent(function (it) { return it.state.lastWatched; }));
    }
    function inContinue(id) {
        return continueWatching().some(function (it) { return it._id === id; });
    }

    // Audio / subtitle language chosen by hand, remembered per title and profile.
    function trackKey() { return 'tracks_' + Profiles.current().id; }
    function trackPref(metaId) { return U.store.get(trackKey(), {})[metaId] || {}; }
    function setTrackPref(metaId, kind, value) {
        var all = U.store.get(trackKey(), {});
        var p = all[metaId] || (all[metaId] = {});
        p[kind] = value;
        U.store.set(trackKey(), all);
    }

    // ── Episodes ──
    function sortedEpisodes(meta) {
        return (meta.videos || []).filter(function (v) { return v.season > 0; }).sort(function (a, b) {
            return a.season - b.season || (a.episode || a.number || 0) - (b.episode || b.number || 0);
        });
    }

    function nextEpisode(meta, videoId) {
        var eps = sortedEpisodes(meta);
        for (var i = 0; i < eps.length - 1; i++) if (eps[i].id === videoId) return eps[i + 1];
        return null;
    }

    // Per-episode progress, per profile, on this device: {metaId: {videoId: [timeSec, durationSec, watched]}}.
    function epKey() { return 'episodes_' + Profiles.current().id; }
    function epAll() { return U.store.get(epKey(), {}); }
    function epRecord(metaId, videoId, t, d, watched) {
        var all = epAll();
        var m = all[metaId] || (all[metaId] = {});
        m[videoId] = [Math.round(t), Math.round(d), watched ? 1 : 0];
        U.store.set(epKey(), all);
    }

    // Mark episodes watched / not watched by hand (-1 = explicitly not watched,
    // overrides what Stremio says). Watched ones move "continue" past them.
    function setWatched(meta, videoIds, on) {
        var all = epAll();
        var m = all[meta.id] || (all[meta.id] = {});
        videoIds.forEach(function (id) { m[id] = [0, 0, on ? 1 : -1]; });
        U.store.set(epKey(), all);
        var it = item(meta.id);
        if (!it || !it.state || videoIds.indexOf(it.state.video_id) === -1) return Promise.resolve();
        var copy = JSON.parse(JSON.stringify(it));
        if (on) {
            var eps = sortedEpisodes(meta), last = -1;
            eps.forEach(function (v, i) { if (videoIds.indexOf(v.id) !== -1) last = i; });
            var next = eps[last + 1];
            if (next) { copy.state.video_id = next.id; copy.state.timeOffset = 1; copy.state.duration = 0; }
            else copy.state.timeOffset = 0;
        } else {
            copy.state.timeOffset = 0;
        }
        return commit(copy);
    }

    // Episodes marked watched by Stremio itself (other devices / the official
    // app): state.watched = "<anchorVideoId>:<anchorLength>:<base64 zlib bitfield>".
    var stremioWatched = {};
    function b64bytes(b64) {
        var bin = atob(b64), out = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
        return out;
    }
    function decodeWatched(str, videoIds) {
        if (typeof DecompressionStream === 'undefined' || typeof Response === 'undefined') return Promise.resolve({});
        var parts = String(str).split(':');
        if (parts.length < 3) return Promise.resolve({});
        var b64 = parts.pop(), len = parseInt(parts.pop(), 10), anchor = parts.join(':');
        var anchorIdx = videoIds.indexOf(anchor);
        if (anchorIdx < 0 || !(len > 0)) return Promise.resolve({});
        var stream = new Blob([b64bytes(b64)]).stream().pipeThrough(new DecompressionStream('deflate'));
        return new Response(stream).arrayBuffer().then(function (buf) {
            var bits = new Uint8Array(buf), set = {}, offset = len - anchorIdx - 1;
            videoIds.forEach(function (id, i) {
                var j = i + offset;
                if (j >= 0 && (bits[j >> 3] >> (j & 7)) & 1) set[id] = true;
            });
            return set;
        });
    }

    // Call before drawing a series' episodes (resolves even on failure).
    function loadWatched(meta) {
        var it = item(meta.id);
        stremioWatched[meta.id] = {};
        if (!it || !it.state || !it.state.watched || !meta.videos) return Promise.resolve();
        var ids = meta.videos.map(function (v) { return v.id; });
        var p;
        try { p = decodeWatched(it.state.watched, ids); } catch (e) { return Promise.resolve(); }
        return p.then(function (set) { stremioWatched[meta.id] = set; },
            function () {});
    }

    // {progress 0..1, time sec, watched bool} for one episode.
    function episodeState(meta, videoId) {
        var out = { progress: 0, time: 0, watched: false };
        var rec = (epAll()[meta.id] || {})[videoId];
        var it = item(meta.id), st = it && it.state;
        if (rec && rec[2] === 1) { out.watched = true; out.progress = 1; return out; }
        if (rec && rec[2] === -1) return out;
        if (rec && rec[1] > 0 && rec[0] > 0) { out.time = rec[0]; out.progress = Math.min(1, rec[0] / rec[1]); return out; }
        if (st && st.video_id === videoId && st.timeOffset > 1000 && st.duration > 0) {
            out.time = st.timeOffset / 1000; out.progress = Math.min(1, st.timeOffset / st.duration); return out;
        }
        if ((stremioWatched[meta.id] || {})[videoId]) { out.watched = true; out.progress = 1; }
        return out;
    }

    // Series that left "continue watching" because an episode was finished
    // (older versions reset the position): point them at the next episode.
    var repaired = {};
    function repairContinue() {
        var cutoff = Date.now() - 60 * 86400000;
        var todo = items().filter(function (it) {
            var s = it.state || {};
            return it.type === 'series' && !repaired[it._id] && (!it.removed || it.temp) && !(s.timeOffset > 0) && !dismissed(it)
                && /:\d+:\d+$/.test(s.video_id || '') && s.lastWatched && new Date(s.lastWatched) > cutoff;
        }).slice(0, 10);
        return Promise.all(todo.map(function (it) {
            repaired[it._id] = true;
            return API.meta('series', it._id).then(function (meta) {
                var next = nextEpisode(meta, it.state.video_id);
                var cur = item(it._id);
                if (!next || !cur || cur.state.timeOffset > 0) return;
                var copy = JSON.parse(JSON.stringify(cur));
                copy.state.video_id = next.id;
                copy.state.timeOffset = 1;           // what Stremio does: shows in "continue watching"
                copy.state.duration = 0;
                return commit(copy);
            }).catch(function () {});
        }));
    }

    function myList() {
        return items().filter(function (it) { return !it.removed && !it.temp; })
            .sort(byRecent(function (it) { return it._mtime; }));
    }

    function inList(id) { var it = item(id); return !!(it && !it.removed && !it.temp); }

    function setInList(meta, on) {
        var it = base(meta);
        it.removed = !on;
        it.temp = false;
        if (meta.poster) it.poster = meta.poster;
        it._mtime = new Date().toISOString();
        return commit(it);
    }

    function saveProgress(meta, videoId, timeSec, durationSec) {
        if (!meta || !isFinite(timeSec) || !isFinite(durationSec) || durationSec <= 0) return;
        var it = base(meta);
        var st = it.state || (it.state = {});
        var now = new Date().toISOString();
        var vid = videoId || meta.id;
        var finished = timeSec / durationSec > 0.9;
        st.lastWatched = now;
        st.video_id = vid;
        st.duration = Math.round(durationSec * 1000);
        if (meta.type === 'series') epRecord(meta.id, vid, timeSec, durationSec, finished);
        if (finished) {
            st.timeOffset = 0;                         // movie finished: leaves "continue watching"
            if (meta.type === 'movie') st.flaggedWatched = 1;
            st.timesWatched = (st.timesWatched || 0) + 1;
            // Series: stay in "continue watching", on the next episode (like Stremio).
            var next = meta.type === 'series' ? nextEpisode(meta, vid) : null;
            if (next) { st.video_id = next.id; st.timeOffset = 1; st.duration = 0; }
        } else {
            st.timeOffset = Math.round(timeSec * 1000);
        }
        it._mtime = now;
        return commit(it);
    }

    // Series you follow (list + continue) with an episode out in the last 3 weeks
    // that you have not watched: [{item, meta, video}], newest first.
    var metaCache = {};
    function newEpisodes() {
        var seen = {}, series = continueWatching().concat(myList()).filter(function (it) {
            if (it.type !== 'series' || seen[it._id]) return false;
            seen[it._id] = true;
            return true;
        }).slice(0, 20);
        var now = Date.now(), from = now - 21 * 86400000;
        return Promise.all(series.map(function (it) {
            var c = metaCache[it._id];
            var p = c && now - c.at < 3600000 ? Promise.resolve(c.meta)
                : API.meta('series', it._id).then(function (m) { metaCache[it._id] = { at: now, meta: m }; return m; });
            return p.then(function (meta) {
                if (!meta.id) meta.id = it._id;
                if (!meta.type) meta.type = 'series';
                return loadWatched(meta).then(function () {
                    var fresh = sortedEpisodes(meta).filter(function (v) {
                        var t = v.released ? new Date(v.released).getTime() : 0;
                        return t >= from && t <= now && !episodeState(meta, v.id).watched;
                    });
                    if (!fresh.length) return null;
                    return { item: it, meta: meta, video: fresh[0], count: fresh.length,
                        released: new Date(fresh[fresh.length - 1].released).getTime() };
                });
            }).catch(function () { return null; });
        })).then(function (list) {
            return list.filter(Boolean).sort(function (a, b) { return b.released - a.released; });
        });
    }

    return { item: item, continueWatching: continueWatching, myList: myList, inList: inList,
        setInList: setInList, saveProgress: saveProgress, isOwner: isOwner,
        nextEpisode: nextEpisode, episodeState: episodeState, loadWatched: loadWatched,
        repairContinue: repairContinue, dismissContinue: dismissContinue, inContinue: inContinue,
        setWatched: setWatched, trackPref: trackPref, setTrackPref: setTrackPref, newEpisodes: newEpisodes, _decodeWatched: decodeWatched };
})();
