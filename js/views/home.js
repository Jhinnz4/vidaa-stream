// Shared building blocks (posters, cards, rows, grids, sidebar, hero) + home.
Views.ui = (function () {
    'use strict';
    var h = U.h;

    var io = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
            if (en.isIntersecting) { en.target.src = en.target.dataset.src; io.unobserve(en.target); }
        });
    }, { rootMargin: '600px' }) : null;

    function poster(url) {
        if (!url) return h('div.poster-empty');
        var img = h('img', { alt: '' });
        if (io) { img.dataset.src = url; io.observe(img); } else img.src = url;
        img.addEventListener('error', function () { img.style.visibility = 'hidden'; });
        return img;
    }

    function art(id, kind) {
        // Metahub serves artwork for IMDb ids; used when a preview has none.
        return /^tt\d+/.test(id || '') ? 'https://images.metahub.space/' + kind + '/medium/' + id.split(':')[0] + '/img' : null;
    }

    // m: {id, type, name, poster, …}; extra: {progress 0..1, sub, onFocus(m), onOpen(m)}
    function card(m, extra) {
        extra = extra || {};
        var c = h('div.card.f', {
            onSelect: function () { if (extra.onOpen) extra.onOpen(m); App.push(Views.detail(m.type, m.id, m)); },
            onFocus: function () { if (extra.onFocus) extra.onFocus(m); }
        },
            h('div.card-img', null, poster(m.poster || art(m.id, 'poster')),
                extra.badge ? h('div.card-badge', { text: extra.badge }) : null,
                extra.progress ? h('div.card-progress', null, h('div', { style: 'width:' + Math.round(extra.progress * 100) + '%' })) : null),
            h('div.card-title', { text: m.name || '' }),
            extra.sub ? h('div.card-sub', { text: extra.sub }) : null);
        return c;
    }

    function row(title, cards) {
        var items = h('div.row-items.sx', { 'data-group': '' }, cards);
        function arrow(dir) {
            var a = h('div.row-arrow.tap.' + (dir < 0 ? 'prev' : 'next'), { text: dir < 0 ? '‹' : '›' });
            a._onTap = function () { items.scrollBy({ left: dir * items.clientWidth * 0.8, behavior: 'smooth' }); };
            return a;
        }
        return h('section.row', { 'data-vanchor': '' }, h('h3', { text: title }), items, arrow(-1), arrow(1));
    }

    function grid(cards) { return h('div.grid', { 'data-group': '' }, cards); }

    function avatar(p, cls) {
        return h('img.avatar' + (cls ? '.' + cls : ''), { src: Profiles.avatarSrc(p.avatar), alt: '' });
    }

    // Icon rail that opens (labels) while it has focus, over the content.
    function sidebar(active) {
        var nav;
        // Entering the menu lands on the current section; → goes back where you were.
        function open(el) {
            nav.classList.add('open');
            var from = Nav.previous();
            if (from && !nav.contains(from)) {
                nav._from = from;
                var act = nav.querySelector('.side-item.active');
                if (act && act !== el) Nav.focus(act);
            }
        }
        function close(_, next) { if (!next || !nav.contains(next)) nav.classList.remove('open'); }
        function railRect() {
            var r = this.getBoundingClientRect();
            var w = parseFloat(getComputedStyle(document.documentElement).fontSize) * 3.6;
            return { left: r.left, right: r.left + w, top: r.top, bottom: r.bottom, width: w, height: r.height };
        }
        function item(id, icon, label, factory) {
            return withRail(h('div.side-item.f' + (id === active ? '.active' : ''), {
                onFocus: open, onBlur: close,
                onSelect: function () {
                    if (id === active) return;
                    if (id === 'home') App.section(null); else App.section(factory);
                }
            }, h('span.side-icon', { html: icon }), h('span.side-label', { text: label })));
        }
        // Up/down stay inside the rail (in order); right uses the narrow rail box.
        function railMove(dir) {
            if (dir === 'left') return true;                 // edge of the screen
            if (dir === 'right' && nav._from && nav._from.isConnected && nav._from.offsetParent) {
                Nav.focus(nav._from);
                return true;
            }
            if (dir !== 'up' && dir !== 'down') return false;
            var all = Array.prototype.slice.call(nav.querySelectorAll('.side-item.f'));
            var i = all.indexOf(this) + (dir === 'down' ? 1 : -1);
            if (all[i]) Nav.focus(all[i]);
            return true;
        }
        function withRail(el) { el._navRect = railRect; el._onMove = railMove; return el; }
        var me = Profiles.current();
        nav = h('nav.sidebar', { 'data-group': '', 'data-nav-enter': 'left' },
            withRail(h('div.side-item.side-profile.f', { onFocus: open, onBlur: close,
                onSelect: function () { App.reset(Views.profiles()); } },
                h('span.side-icon', null, avatar(me)), h('span.side-label', { text: me.name }))),
            h('div.side-items', null,
                item('search', Icons.search, 'Recherche', function () { return Views.search(); }),
                item('home', Icons.home, 'Accueil'),
                item('movie', Icons.movie, 'Films', function () { return Views.browse('movie'); }),
                item('series', Icons.series, 'Séries', function () { return Views.browse('series'); }),
                item('list', Icons.list, 'Ma liste', function () { return Views.myList(); })),
            item('settings', Icons.settings, 'Réglages', function () { return Views.settings(); }));
        return nav;
    }

    // Big artwork + info for whatever card has focus (debounced: no flicker while scrolling).
    function hero() {
        var bg = h('div.hero-bg'), logo = h('img.hero-logo', { alt: '' }), title = h('h1.hero-title');
        var info = h('p.hero-info'), desc = h('p.hero-desc');
        var el = h('div.hero', null, bg, h('div.hero-shade'), h('div.hero-text', null, logo, title, info, desc));
        var shown = null;
        logo.addEventListener('error', function () { logo.style.display = 'none'; title.style.display = ''; });
        logo.addEventListener('load', function () { logo.style.display = ''; title.style.display = 'none'; });
        var show = U.debounce(function (m) {
            if (shown === m.id) return;
            shown = m.id;
            var bgUrl = m.background || art(m.id, 'background');
            bg.style.opacity = '0';
            setTimeout(function () {
                bg.style.backgroundImage = bgUrl ? 'url("' + bgUrl + '")' : 'none';
                bg.style.opacity = '1';
            }, 120);
            title.textContent = m.name || '';
            title.style.display = '';
            var logoUrl = m.logo || art(m.id, 'logo');
            logo.style.display = 'none';
            if (logoUrl) logo.src = logoUrl; else logo.removeAttribute('src');
            var genres = (m.genres || m.genre || []).slice(0, 3).join(' · ');
            info.textContent = [U.year(m), m.runtime, genres, m.imdbRating ? '★ ' + m.imdbRating : ''].filter(Boolean).join('   ');
            desc.textContent = m.description || '';
        }, 250);
        return { el: el, show: show };
    }

    // Home catalog rows in the profile's order, hidden ones flagged.
    function catKey(c) { return (c.addon.transportUrl || '') + '|' + c.cat.type + '|' + c.cat.id; }
    function homeRows() {
        var cfg = Profiles.prefs().homeRows || {}, order = cfg.order || [], hidden = cfg.hidden || [];
        return API.homeCatalogs().map(function (c, i) {
            var k = catKey(c), pos = order.indexOf(k);
            return { c: c, key: k, hidden: hidden.indexOf(k) !== -1, rank: pos === -1 ? 1000 + i : pos };
        }).sort(function (a, b) { return a.rank - b.rank; });
    }

    return { card: card, row: row, grid: grid, sidebar: sidebar, poster: poster, avatar: avatar, hero: hero, art: art,
        homeRows: homeRows };
})();

Views.home = function () {
    'use strict';
    var h = U.h, ui = Views.ui;
    var hero = ui.hero();
    var rows = h('div.rows.sy');
    var main = h('main.content.home', null, hero.el, rows);
    var el = h('div.screen', null, ui.sidebar('home'), main);
    var keysAtStart = App.keyCount();
    var rowsSig = JSON.stringify(Profiles.prefs().homeRows);
    var focusHero = function (m) { hero.show(m); };

    function epSub(it) {
        var m = (it.state.video_id || '').match(/:(\d+):(\d+)$/);
        return m ? 'S' + m[1] + ' · É' + m[2] : '';
    }

    function libRows() {
        var out = [];
        var cw = Lib.continueWatching().slice(0, 20);
        if (cw.length) {
            out.push(ui.row('Continuer à regarder', cw.map(function (it) {
                var st = it.state;
                return ui.card({ id: it._id, type: it.type, name: it.name, poster: it.poster },
                    { progress: st.duration ? Math.min(1, st.timeOffset / st.duration) : 0, sub: epSub(it), onFocus: focusHero });
            })));
        }
        var list = Lib.myList().slice(0, 25);
        if (list.length) {
            out.push(ui.row('Ma liste', list.map(function (it) {
                return ui.card({ id: it._id, type: it.type, name: it.name, poster: it.poster }, { onFocus: focusHero });
            })));
        }
        return out;
    }

    function libSig() {
        return Lib.continueWatching().slice(0, 20).map(function (it) { return it._id + '@' + it.state.video_id + '@' + it.state.timeOffset; }).join('|')
            + '#' + Lib.myList().map(function (it) { return it._id; }).join('|');
    }

    var libBox = h('div');
    rows.appendChild(libBox);
    libRows().forEach(function (r) { libBox.appendChild(r); });
    // New episodes of the series you follow (filled in when known).
    var newBox = h('div');
    rows.appendChild(newBox);
    Lib.newEpisodes().then(function (list) {
        if (!list.length || !newBox.isConnected) return;
        newBox.appendChild(ui.row('Nouveaux épisodes', list.map(function (n) {
            var v = n.video;
            return ui.card({ id: n.meta.id, type: 'series', name: n.meta.name || n.item.name, poster: n.meta.poster || n.item.poster },
                { badge: n.count > 1 ? n.count + ' nouveaux' : 'Nouveau', sub: 'S' + v.season + ' · É' + (v.episode || v.number), onFocus: focusHero });
        })));
    });
    var sig = libSig();

    function catName(c) {
        var typeName = { movie: 'Films', series: 'Séries', channel: 'Chaînes', tv: 'TV' }[c.cat.type] || c.cat.type;
        return (c.cat.name || c.cat.id) + ' — ' + typeName;
    }

    // Catalog rows in addon order; each slot is reserved so rows never jump around.
    ui.homeRows().filter(function (r) { return !r.hidden; }).map(function (r) { return r.c; }).slice(0, 12).forEach(function (c) {
        var slot = h('div');
        rows.appendChild(slot);
        API.catalog(c.addon, c.cat).then(function (metas) {
            if (!metas.length) { if (slot.parentNode) slot.parentNode.removeChild(slot); return; }
            var r = ui.row(catName(c), metas.slice(0, 25).map(function (m) {
                if (!m.type) m.type = c.cat.type;
                return ui.card(m, { onFocus: focusHero });
            }));
            slot.parentNode.replaceChild(r, slot);
            // Until the user presses a key, focus follows the first row as rows arrive.
            if (App.keyCount() === keysAtStart && App.top() && App.top().el === el) {
                var first = rows.querySelector('.card.f');
                if (first && Nav.current() !== first) Nav.focus(first);
            }
        }, function () { if (slot.parentNode) slot.parentNode.removeChild(slot); });
    });
    var firstCard = rows.querySelector('.card.f');
    if (firstCard) firstCard.classList.add('autofocus');

    // Refresh library rows only when they changed (keeps focus otherwise).
    function refreshLib(onShow) {
        var s = libSig();
        if (s === sig) return;
        var cur = Nav.current();
        if (!onShow && cur && libBox.contains(cur) && App.keyCount() !== keysAtStart) return;   // user is in there: next onShow
        sig = s;
        U.clear(libBox);
        libRows().forEach(function (r) { libBox.appendChild(r); });
        if (App.keyCount() === keysAtStart && App.top() && App.top().el === el) {
            var first = rows.querySelector('.card.f');
            if (first) Nav.focus(first);
        }
    }
    // Series that dropped out of "continue watching" after a finished episode come back.
    Lib.repairContinue().then(function () { refreshLib(false); });

    return { name: 'home', el: el, onShow: function () {
        // Rows were customised in Réglages: rebuild the page.
        if (JSON.stringify(Profiles.prefs().homeRows) !== rowsSig) { setTimeout(function () { App.reset(Views.home()); }, 0); return; }
        refreshLib(true);
    } };
};
