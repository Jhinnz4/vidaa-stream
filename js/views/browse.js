// Films / Séries: catalog picker, genre filter, poster grid that loads more as you go.
Views.browse = function (type) {
    'use strict';
    var h = U.h, ui = Views.ui;
    var cats = API.homeCatalogs().filter(function (c) { return c.cat.type === type; });
    // Catalogs that accept a genre filter are usable too (genre is optional there).
    var catBar = h('div.chips.sx', { 'data-group': '' });
    var genreBar = h('div.chips.sx', { 'data-group': '' });
    var gridBox = h('div');
    var status = h('p.muted');
    var body = h('div.browse-body.sy', null, h('div', { 'data-vanchor': '' }, catBar), h('div', { 'data-vanchor': '' }, genreBar), gridBox, status);
    var main = h('main.content.browse', null, h('h2.page-title', { text: type === 'movie' ? 'Films' : 'Séries' }), body);
    var el = h('div.screen', null, ui.sidebar(type), main);
    var cur = null, genre = null, loaded = 0, loading = false, done = false, seq = 0, grid = null;
    var keysAtStart = App.keyCount();

    function genresOf(c) {
        var g = (c.cat.extra || []).filter(function (e) { return e.name === 'genre'; })[0];
        return (g && g.options) || c.cat.genres || [];
    }

    function chip(label, selected, action) {
        return h('button.chip.f' + (selected ? '.selected' : ''), { text: label, onSelect: action });
    }

    function renderBars() {
        U.clear(catBar);
        cats.forEach(function (c) {
            var b = chip(c.cat.name || c.cat.id, c === cur, function () { if (c !== cur) { cur = c; genre = null; reload(); } });
            if (c === cur) b.classList.add('autofocus');
            catBar.appendChild(b);
        });
        U.clear(genreBar);
        var gs = genresOf(cur);
        genreBar.style.display = gs.length ? '' : 'none';
        if (!gs.length) return;
        genreBar.appendChild(chip('Tous les genres', !genre, function () { if (genre) { genre = null; reload(); } }));
        gs.forEach(function (g) {
            genreBar.appendChild(chip(g, genre === g, function () { if (genre !== g) { genre = g; reload(); } }));
        });
    }

    function more() {
        if (loading || done || !cur) return;
        loading = true;
        var my = seq;
        var extra = {};
        if (genre) extra.genre = genre;
        if (loaded) extra.skip = loaded;
        status.textContent = 'Chargement…';
        API.catalog(cur.addon, cur.cat, Object.keys(extra).length ? extra : null).then(function (metas) {
            if (my !== seq) return;
            loading = false;
            if (!metas.length) { done = true; status.textContent = loaded ? '' : 'Rien dans ce catalogue.'; return; }
            status.textContent = '';
            metas.forEach(function (m, i) {
                if (!m.type) m.type = type;
                var idx = loaded + i;
                grid.appendChild(ui.card(m, { onFocus: function () { if (idx > loaded - 14) more(); } }));
            });
            var first = !loaded;
            loaded += metas.length;
            // Entering the page: once posters are here, focus moves into them (unless the user already moved).
            if (first && App.top() && App.top().el === el && App.keyCount() === keysAtStart) {
                var c = grid.querySelector('.card.f');
                if (c) Nav.focus(c);
            }
        }, function () { if (my === seq) { loading = false; status.textContent = 'Erreur de chargement.'; } });
    }

    function reload() {
        seq++;
        loaded = 0; loading = false; done = false;
        // Chips are rebuilt: keep the focus on the chip that was just pressed.
        var f = Nav.current();
        var bar = f && (catBar.contains(f) ? catBar : genreBar.contains(f) ? genreBar : null);
        var label = bar ? f.textContent : null;
        U.clear(gridBox);
        grid = ui.grid([]);
        gridBox.appendChild(grid);
        renderBars();
        if (bar) {
            var same = Array.prototype.filter.call(bar.children, function (c) { return c.textContent === label; })[0];
            if (same) Nav.focus(same);
        }
        more();
    }

    body.addEventListener('scroll', function () {
        if (body.scrollTop + body.clientHeight > body.scrollHeight - 600) more();
    });

    if (cats.length) { cur = cats[0]; reload(); }
    else status.textContent = 'Aucun catalogue de ' + (type === 'movie' ? 'films' : 'séries') + ' dans tes addons.';

    return { name: 'browse', el: el };
};

Views.myList = function () {
    'use strict';
    var h = U.h, ui = Views.ui;
    var box = h('div.browse-body.sy');
    var main = h('main.content.browse', null, h('h2.page-title', { text: 'Ma liste' }), box);
    var el = h('div.screen', null, ui.sidebar('list'), main);
    var sig = null;

    function render() {
        var items = Lib.myList();
        var s = items.map(function (it) { return it._id; }).join('|');
        if (s === sig) return;
        sig = s;
        U.clear(box);
        if (!items.length) {
            box.appendChild(h('div.search-empty', null, h('h3', { text: 'Ta liste est vide' }),
                h('p.muted', { text: 'Sur la fiche d’un film ou d’une série, choisis « Ma liste » pour l’ajouter ici.' })));
            return;
        }
        box.appendChild(ui.grid(items.map(function (it, i) {
            var c = ui.card({ id: it._id, type: it.type, name: it.name, poster: it.poster });
            if (!i) c.classList.add('autofocus');
            return c;
        })));
    }
    render();
    return { name: 'mylist', el: el, onShow: render };
};
