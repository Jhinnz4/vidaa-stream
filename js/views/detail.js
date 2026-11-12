// Movie / series page: info, play-or-resume, seasons and episodes.
Views.detail = function (type, id, preview) {
    'use strict';
    var h = U.h;
    var bg = h('div.detail-bg');
    var body = h('div.detail-body.sy', null, h('div.splash-inline', null, h('div.spinner')));
    var el = h('div.detail', null, bg, body);
    var meta = null;
    function progressSig() {
        var it = Lib.item(id);
        return it ? JSON.stringify(it.state) : '';
    }
    var sig = progressSig();

    function resumeInfo(videoId) {
        var it = Lib.item(id);
        if (!it || !it.state || !(it.state.timeOffset > 0)) return null;
        if (videoId && it.state.video_id && it.state.video_id !== videoId) return null;
        return { videoId: it.state.video_id || id, time: it.state.timeOffset / 1000, duration: it.state.duration / 1000 };
    }

    // Play buttons start the best source directly; "Choisir la source" opens the list.
    function openStreams(video, startAt, manual) {
        App.push(Views.streams(meta, video, startAt, manual ? null : { best: true }));
    }

    function chooseButton(video, startAt) {
        return h('button.btn.f', { text: 'Choisir la source', onSelect: function () { openStreams(video, startAt, true); } });
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

    function listButton() {
        function label() { return Lib.inList(meta.id) ? '✓ Dans ma liste' : '+ Ma liste'; }
        var b = h('button.btn.f', { text: label(), onSelect: function () {
            var on = !Lib.inList(meta.id);
            Lib.setInList(meta, on);
            b.textContent = label();
            U.toast(on ? 'Ajouté à ta liste' : 'Retiré de ta liste');
        } });
        return b;
    }

    function render() {
        var bgUrl = meta.background || Views.ui.art(meta.id, 'background');
        if (bgUrl) bg.style.backgroundImage = 'url("' + bgUrl + '")';
        U.clear(body);
        var logoUrl = meta.logo || Views.ui.art(meta.id, 'logo');
        var head = h('div.detail-head', { 'data-vanchor': '' },
            logoUrl ? h('img.detail-logo', { src: logoUrl, alt: meta.name, onerror: function () {
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
            actions.appendChild(chooseButton(null, r && r.time > 30 ? r.time : 0));
            actions.appendChild(listButton());
            return;
        }

        // Series: resume button, season picker, episode list.
        var vids = sortedVideos();
        var res = resumeInfo(null);
        var resumeVid = res && vids.filter(function (v) { return v.id === res.videoId; })[0];
        if (resumeVid) {
            actions.appendChild(h('button.btn.primary.f.autofocus', {
                text: (res.time > 30 ? '▶ Reprendre ' : '▶ Lecture ') + epLabel(resumeVid) + (res.time > 30 ? ' à ' + U.fmtTime(res.time) : ''),
                onSelect: function () { openStreams(resumeVid, res.time); } }));
            actions.appendChild(chooseButton(resumeVid, res.time));
        }
        actions.appendChild(listButton());
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
                var es = Lib.episodeState(meta, v.id);
                var resumeAt = !es.watched && es.time > 30 ? es.time : 0;
                epList.appendChild(h('div.episode.f' + (es.watched ? '.watched' : ''), { 'data-vanchor': '', onSelect: function () {
                    openStreams(v, resumeAt);
                } },
                h('div.ep-thumb', null, Views.ui.poster(v.thumbnail),
                    es.watched ? h('div.ep-seen', { html: Icons.check + '<span>Vu</span>' }) : null,
                    es.progress > 0.01 ? h('div.card-progress', null, h('div', { style: 'width:' + Math.round(es.progress * 100) + '%' })) : null),
                h('div.ep-text', null,
                    h('div.ep-title', { text: (v.episode || v.number) + '. ' + (v.title || v.name || 'Épisode') }),
                    h('div.muted', { text: [v.released ? new Date(v.released).toLocaleDateString('fr-FR') : '',
                        es.watched ? 'Vu' : (resumeAt ? 'Reprendre à ' + U.fmtTime(resumeAt) : '')].filter(Boolean).join('  ·  ') }),
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
        // Episodes already marked watched in Stremio (other devices): decode first.
        return Lib.loadWatched(meta);
    }).then(function () {
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
