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

    function continueWatching() {
        return items().filter(function (it) {
            var s = it.state || {};
            return (!it.removed || it.temp) && s.timeOffset > 0 && s.lastWatched;
        }).sort(byRecent(function (it) { return it.state.lastWatched; }));
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
        st.lastWatched = now;
        st.video_id = videoId || meta.id;
        st.duration = Math.round(durationSec * 1000);
        if (timeSec / durationSec > 0.9) {
            st.timeOffset = 0;                         // finished: leaves "continue watching"
            if (meta.type === 'movie') st.flaggedWatched = 1;
            st.timesWatched = (st.timesWatched || 0) + 1;
        } else {
            st.timeOffset = Math.round(timeSec * 1000);
        }
        it._mtime = now;
        return commit(it);
    }

    return { item: item, continueWatching: continueWatching, myList: myList, inList: inList,
        setInList: setInList, saveProgress: saveProgress, isOwner: isOwner };
})();
