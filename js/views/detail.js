// Movie / series page: info, play-or-resume, seasons and episodes.
Views.detail = function (type, id, preview) {
    'use strict';
    var h = U.h;
    var bg = h('div.detail-bg');
    var body = h('div.detail-body.sy', null, h('div.splash-inline', null, h('div.spinner')));
    var el = h('div.detail', null, bg, body);
    var meta = null;
    function progressSig() {
        var it = API.libraryItem(id);
        return it ? JSON.stringify(it.state) : '';
    }
    var sig = progressSig();

    function resumeInfo(videoId) {
        var it = API.libraryItem(id);
        if (!it || !it.state || !it.state.timeOffset) return null;
        if (videoId && it.state.video_id && it.state.video_id !== videoId) return null;
        return { videoId: it.state.video_id || id, time: it.state.timeOffset / 1000, duration: it.state.duration / 1000 };
    }

    function openStreams(video, startAt) {
        App.push(Views.streams(meta, video, startAt));
    }

    function infoLine(m) {
        var bits = [U.year(m), m.runtime, (m.genres || m.genre || []).slice(0, 3).join(', '),
            m.imdbRating ? '★ ' + m.imdbRating : ''];
        return bits.filter(Boolean).join('   ·   ');
    }

    function sortedVideos() {
        return (meta.videos || []).slice().sort(function (a, b) {
            return (a.season || 0) - (b.season || 0) || (a.episode || a.number || 0) - (b.episode || b.number || 0);
        });
    }

    function epLabel(v) {
        return 'S' + v.season + ' · É' + (v.episode || v.number);
    }

    function render() {
        if (meta.background) bg.style.backgroundImage = 'url("' + meta.background + '")';
        U.clear(body);
        var head = h('div.detail-head', { 'data-vanchor': '' },
            meta.logo ? h('img.detail-logo', { src: meta.logo, alt: meta.name, onerror: function () {
                this.replaceWith(h('h1', { text: meta.name }));
            } }) : h('h1', { text: meta.name }),
            h('p.detail-info', { text: infoLine(meta) }),
            meta.description ? h('p.detail-desc', { text: meta.description }) : null);
        body.appendChild(head);

        var actions = h('div.actions', { 'data-group': '' });
        head.appendChild(actions);

        if (type !== 'series' || !(meta.videos && meta.videos.length)) {
            var r = resumeInfo(null);
            if (r && r.time > 30) {
                actions.appendChild(h('button.btn.primary.f.autofocus', { text: '▶ Reprendre à ' + U.fmtTime(r.time),
                    onSelect: function () { openStreams(null, r.time); } }));
                actions.appendChild(h('button.btn.f', { text: 'Depuis le début', onSelect: function () { openStreams(null, 0); } }));
            } else {
                actions.appendChild(h('button.btn.primary.f.autofocus', { text: '▶ Lecture', onSelect: function () { openStreams(null, 0); } }));
            }
            return;
        }

        // Series: resume button, season picker, episode list.
        var vids = sortedVideos();
        var res = resumeInfo(null);
        var resumeVid = res && vids.filter(function (v) { return v.id === res.videoId; })[0];
        if (resumeVid) {
            actions.appendChild(h('button.btn.primary.f.autofocus', {
                text: '▶ Reprendre ' + epLabel(resumeVid) + (res.time > 30 ? ' à ' + U.fmtTime(res.time) : ''),
                onSelect: function () { openStreams(resumeVid, res.time); } }));
        }
        var seasons = [];
        vids.forEach(function (v) { if (seasons.indexOf(v.season) === -1) seasons.push(v.season); });
        // Specials (season 0) last.
        seasons.sort(function (a, b) { return (a === 0) - (b === 0) || a - b; });
        var startSeason = resumeVid ? resumeVid.season : seasons[0];
        var epList = h('div.episodes', { 'data-group': '' });
        var seasonBar = h('div.seasons.sx', { 'data-group': '' });
        var seasonBtns = {};

        function showSeason(s) {
            Object.keys(seasonBtns).forEach(function (k) { seasonBtns[k].classList.toggle('selected', String(s) === k); });
            U.clear(epList);
            vids.filter(function (v) { return v.season === s; }).forEach(function (v) {
                var r = resumeInfo(v.id);
                var watchedPart = r && r.duration ? r.time / r.duration : 0;
                epList.appendChild(h('div.episode.f', { 'data-vanchor': '', onSelect: function () {
                    openStreams(v, r ? r.time : 0);
                } },
                h('div.ep-thumb', null, Views.ui.poster(v.thumbnail),
                    watchedPart ? h('div.card-progress', null, h('div', { style: 'width:' + Math.round(watchedPart * 100) + '%' })) : null),
                h('div.ep-text', null,
                    h('div.ep-title', { text: (v.episode || v.number) + '. ' + (v.title || v.name || 'Épisode') }),
                    v.released ? h('div.muted', { text: new Date(v.released).toLocaleDateString('fr-FR') }) : null,
                    v.overview || v.description ? h('div.ep-desc', { text: v.overview || v.description }) : null)));
            });
        }

        seasons.forEach(function (s) {
            var b = h('button.btn.small.f', { text: s === 0 ? 'Bonus' : 'Saison ' + s, onSelect: function () { showSeason(s); },
                onFocus: function () { showSeason(s); } });
            seasonBtns[s] = b;
            seasonBar.appendChild(b);
        });
        body.appendChild(h('div', { 'data-vanchor': '' }, seasonBar));
        body.appendChild(epList);
        showSeason(startSeason);
        if (!resumeVid) seasonBtns[startSeason].classList.add('autofocus');
    }

    API.meta(type, id).then(function (m) {
        meta = m;
        if (!meta.type) meta.type = type;
        if (!meta.id) meta.id = id;
        render();
        if (App.top() && App.top().el === el) Nav.focusFirst(el);
    }, function (e) {
        U.clear(body);
        body.appendChild(h('div.splash-inline', null, h('p', { text: 'Impossible de charger la fiche : ' + e.message }),
            h('button.btn.f.autofocus', { text: 'Retour', onSelect: App.back })));
        Nav.focusFirst(el);
    });

    return {
        name: 'detail', el: el,
        onShow: function () {
            // Back from the player: if progress changed, redraw resume buttons/episode bars.
            var s = progressSig();
            if (meta && s !== sig) render();
            sig = s;
        }
    };
};
