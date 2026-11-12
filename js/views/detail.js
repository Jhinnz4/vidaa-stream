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

    // "Retirer de Continuer à regarder" (comes back if you watch it again).
    function continueButton() {
        if (!Lib.inContinue(meta.id)) return null;
        var b = h('button.btn.f', { text: 'Retirer de « Continuer »', onSelect: function () {
            Lib.dismissContinue(meta.id);
            U.toast('Retiré de « Continuer à regarder »');
            var prev = b.previousElementSibling;
            b.parentNode.removeChild(b);
            if (prev) Nav.focus(prev);
        } });
        return b;
    }

    function trailerId() {
        var t = (meta.trailerStreams || []).filter(function (x) { return x.ytId; })[0];
        if (t) return t.ytId;
        t = (meta.trailers || []).filter(function (x) { return x.source && (!x.type || x.type === 'Trailer'); })[0];
        return t ? t.source : null;
    }
    function trailerButton() {
        var yt = trailerId();
        return yt ? h('button.btn.f', { text: 'Bande-annonce', onSelect: function () { App.push(Views.trailer(yt, meta.name)); } }) : null;
    }

    function people(category, field) {
        var names = (meta[field] || []).slice();
        (meta.links || []).forEach(function (l) { if (l.category === category && names.indexOf(l.name) === -1) names.push(l.name); });
        return names;
    }

    // Cast chips (open a search on the name) + same-genre titles.
    var similar = null;
    function moreSection() {
        var box = h('div.detail-more');
        var cast = people('Cast', 'cast').slice(0, 12), dirs = people('Directors', 'director').slice(0, 3);
        if (cast.length || dirs.length) {
            box.appendChild(h('div', { 'data-vanchor': '' }, h('h3.section-title', { text: 'Casting' }),
                h('div.chips.sx', { 'data-group': '' }, dirs.map(function (n) {
                    return h('button.chip.f', { text: n + ' (réal.)', onSelect: function () { App.push(Views.search(n)); } });
                }).concat(cast.map(function (n) {
                    return h('button.chip.f', { text: n, onSelect: function () { App.push(Views.search(n)); } });
                })))));
        }
        var simBox = h('div');
        box.appendChild(simBox);
        function draw(list) {
            if (list.length) simBox.appendChild(Views.ui.row('Titres similaires', list.map(function (m) { return Views.ui.card(m); })));
        }
        if (similar) draw(similar);
        else loadSimilar().then(function (list) { similar = list; if (simBox.isConnected) draw(list); });
        return box;
    }
    function loadSimilar() {
        var genres = meta.genres || meta.genre || [];
        if (!genres.length) return Promise.resolve([]);
        var g = genres[0];
        var cats = API.homeCatalogs().filter(function (c) {
            if (c.cat.type !== type) return false;
            var ex = (c.cat.extra || []).filter(function (e) { return e.name === 'genre'; })[0];
            var opts = (ex && ex.options) || c.cat.genres || [];
            return ex && (!opts.length || opts.indexOf(g) !== -1);
        });
        if (!cats.length) return Promise.resolve([]);
        return API.catalog(cats[0].addon, cats[0].cat, { genre: g }).then(function (metas) {
            return metas.filter(function (m) { return m.id !== meta.id; }).slice(0, 20)
                .map(function (m) { if (!m.type) m.type = type; return m; });
        }, function () { return []; });
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
            [trailerButton(), continueButton()].forEach(function (b) { if (b) actions.appendChild(b); });
            body.appendChild(moreSection());
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
        [trailerButton(), continueButton()].forEach(function (b) { if (b) actions.appendChild(b); });
        var seasons = [];
        vids.forEach(function (v) { if (seasons.indexOf(v.season) === -1) seasons.push(v.season); });
        // Specials (season 0) last.
        seasons.sort(function (a, b) { return (a === 0) - (b === 0) || a - b; });
        var startSeason = resumeVid ? resumeVid.season : seasons[0];
        var epList = h('div.episodes', { 'data-group': '' });
        var seasonBar = h('div.seasons.sx', { 'data-group': '' });
        var seasonBtns = {}, curSeason = null;
        // Mark a whole season watched / not watched.
        var seasonMark = h('button.btn.small.f.season-mark', { onSelect: function () {
            var ids = vids.filter(function (v) { return v.season === curSeason; }).map(function (v) { return v.id; });
            var on = !seasonWatched(curSeason);
            Lib.setWatched(meta, ids, on);
            U.toast(on ? 'Saison marquée comme vue' : 'Saison marquée comme non vue');
            showSeason(curSeason);
        } });
        function seasonWatched(s) {
            return vids.filter(function (v) { return v.season === s; }).every(function (v) { return Lib.episodeState(meta, v.id).watched; });
        }

        function showSeason(s, refocusId) {
            curSeason = s;
            Object.keys(seasonBtns).forEach(function (k) { seasonBtns[k].classList.toggle('selected', String(s) === k); });
            seasonMark.textContent = seasonWatched(s) ? 'Saison non vue' : 'Marquer la saison vue';
            U.clear(epList);
            vids.filter(function (v) { return v.season === s; }).forEach(function (v) {
                var es = Lib.episodeState(meta, v.id);
                var resumeAt = !es.watched && es.time > 30 ? es.time : 0;
                var mark = h('button.btn.small.f.ep-mark', { text: es.watched ? '✓ Vu' : 'Marquer vu', onSelect: function () {
                    Lib.setWatched(meta, [v.id], !es.watched);
                    showSeason(s, v.id);
                } });
                if (refocusId === v.id) setTimeout(function () { Nav.focus(mark); }, 0);
                epList.appendChild(h('div.ep-row', { 'data-vanchor': '' }, h('div.episode.f' + (es.watched ? '.watched' : ''), { onSelect: function () {
                    openStreams(v, resumeAt);
                } },
                h('div.ep-thumb', null, Views.ui.poster(v.thumbnail),
                    es.watched ? h('div.ep-seen', { html: Icons.check + '<span>Vu</span>' }) : null,
                    es.progress > 0.01 ? h('div.card-progress', null, h('div', { style: 'width:' + Math.round(es.progress * 100) + '%' })) : null),
                h('div.ep-text', null,
                    h('div.ep-title', { text: (v.episode || v.number) + '. ' + (v.title || v.name || 'Épisode') }),
                    h('div.muted', { text: [v.released ? new Date(v.released).toLocaleDateString('fr-FR') : '',
                        es.watched ? 'Vu' : (resumeAt ? 'Reprendre à ' + U.fmtTime(resumeAt) : '')].filter(Boolean).join('  ·  ') }),
                    v.overview || v.description ? h('div.ep-desc', { text: v.overview || v.description }) : null)), mark));
            });
        }

        seasons.forEach(function (s) {
            var b = h('button.btn.small.f', { text: s === 0 ? 'Bonus' : 'Saison ' + s, onSelect: function () { showSeason(s); },
                onFocus: function () { showSeason(s); } });
            seasonBtns[s] = b;
            seasonBar.appendChild(b);
        });
        seasonBar.appendChild(seasonMark);
        body.appendChild(h('div', { 'data-vanchor': '' }, seasonBar));
        body.appendChild(epList);
        body.appendChild(moreSection());
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

// YouTube trailer, full screen; Back closes it.
Views.trailer = function (ytId, name) {
    'use strict';
    var src = 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(ytId) + '?autoplay=1&rel=0&modestbranding=1&playsinline=1';
    var el = U.h('div.trailer', null,
        U.h('iframe', { src: src, allow: 'autoplay; encrypted-media; fullscreen', allowfullscreen: '', title: name || 'Bande-annonce' }),
        U.h('div.trailer-hint.muted', { text: 'Retour pour fermer' }));
    return { name: 'trailer', el: el, onKey: function (k) { if (k === 'back' || k === 'stop') { App.pop(); return true; } return true; } };
};
