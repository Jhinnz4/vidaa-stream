// Shared building blocks (poster cards, rows, sidebar) + the home screen.
Views.ui = (function () {
    'use strict';
    var h = U.h;

    var io = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
            if (en.isIntersecting) { en.target.src = en.target.dataset.src; io.unobserve(en.target); }
        });
    }, { rootMargin: '400px' }) : null;

    function poster(url) {
        var img = h('img', { alt: '' });
        if (!url) return h('div.poster-empty');
        if (io) { img.dataset.src = url; io.observe(img); } else img.src = url;
        img.addEventListener('error', function () { img.style.visibility = 'hidden'; });
        return img;
    }

    // metaPreview: {id, type, name, poster}; extra: {progress: 0..1, sub: string}
    function card(m, extra) {
        extra = extra || {};
        return h('div.card.f', { onSelect: function () { App.push(Views.detail(m.type, m.id, m)); } },
            h('div.card-img', null, poster(m.poster),
                extra.progress ? h('div.card-progress', null, h('div', { style: 'width:' + Math.round(extra.progress * 100) + '%' })) : null),
            h('div.card-title', { text: m.name || '' }),
            extra.sub ? h('div.card-sub', { text: extra.sub }) : null);
    }

    function row(title, cards) {
        return h('section.row', { 'data-vanchor': '' },
            h('h3', { text: title }),
            h('div.row-items.sx', { 'data-group': '' }, cards));
    }

    function sidebar(active) {
        function item(id, label, open) {
            return h('div.side-item.f' + (id === active ? '.active' : ''), { text: label, onSelect: function () {
                if (id === active) return;
                if (id === 'home') { while (App.top() && App.top().name !== 'home') App.pop(); return; }
                if (App.top().name !== 'home') App.pop();
                App.push(open());
            } });
        }
        return h('nav.sidebar', { 'data-group': '' },
            h('div.brand', { text: 'Stream+' }),
            item('home', 'Accueil'),
            item('search', 'Recherche', function () { return Views.search(); }),
            item('settings', 'Réglages', function () { return Views.settings(); }));
    }

    return { card: card, row: row, sidebar: sidebar, poster: poster };
})();

Views.home = function () {
    'use strict';
    var h = U.h, ui = Views.ui;
    var main = h('main.content.sy');
    var el = h('div.screen', null, ui.sidebar('home'), main);
    var keysAtStart = App.keyCount();

    function cwRow() {
        var items = API.continueWatching().slice(0, 20);
        if (!items.length) return null;
        return ui.row('Continuer à regarder', items.map(function (it) {
            var st = it.state, sub = '';
            var m = (st.video_id || '').match(/:(\d+):(\d+)$/);
            if (m) sub = 'S' + m[1] + ' · É' + m[2];
            return ui.card({ id: it._id, type: it.type, name: it.name, poster: it.poster },
                { progress: st.duration ? Math.min(1, st.timeOffset / st.duration) : 0, sub: sub });
        }));
    }

    function catName(c) {
        var typeName = { movie: 'Films', series: 'Séries', channel: 'Chaînes', tv: 'TV' }[c.cat.type] || c.cat.type;
        return (c.cat.name || c.cat.id) + ' — ' + typeName;
    }

    function cwSig() {
        return API.continueWatching().slice(0, 20).map(function (it) {
            return it._id + '@' + it.state.timeOffset;
        }).join('|');
    }
    var sig = cwSig();
    var cw = cwRow();
    if (cw) main.appendChild(cw);

    // Catalog rows, in addon order; each row slot is reserved so rows never jump around.
    API.homeCatalogs().slice(0, 12).forEach(function (c) {
        var slot = h('div');
        main.appendChild(slot);
        API.catalog(c.addon, c.cat).then(function (metas) {
            if (!metas.length) { slot.parentNode && slot.parentNode.removeChild(slot); return; }
            var r = ui.row(catName(c), metas.slice(0, 25).map(function (m) {
                if (!m.type) m.type = c.cat.type;
                return ui.card(m);
            }));
            slot.parentNode.replaceChild(r, slot);
            // Until the user presses a key, focus follows the first row as rows arrive.
            if (App.keyCount() === keysAtStart && App.top() && App.top().el === el) {
                var first = main.querySelector('.card.f');
                if (first && Nav.current() !== first) Nav.focus(first);
            }
        }, function () { slot.parentNode && slot.parentNode.removeChild(slot); });
    });

    return {
        name: 'home', el: el,
        onShow: function () {
            // Refresh "continue watching" only when progress changed (keeps focus otherwise).
            var s = cwSig();
            if (s === sig) return;
            sig = s;
            var old = main.querySelector('.row');
            var fresh = cwRow();
            var isCw = old && old.querySelector('h3').textContent === 'Continuer à regarder';
            if (isCw && fresh) main.replaceChild(fresh, old);
            else if (isCw) main.removeChild(old);
            else if (fresh) main.insertBefore(fresh, main.firstChild);
        }
    };
};
