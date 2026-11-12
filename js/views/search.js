// Search with an on-screen keyboard (left) and live results (right).
// No TV keyboard involved, so nothing can close it mid-typing.
Views.search = function (initial) {
    'use strict';
    var h = U.h, ui = Views.ui;
    var results = h('div.search-results.sy');
    var kb = Keyboard({ placeholder: 'Titre, film, série…', onChange: function (v) { debounced(v); } });
    var main = h('main.content.search', null, h('div.search-left', null, kb.el), results);
    var el = h('div.screen', null, ui.sidebar('search'), main);
    var last = null, seq = 0;

    function remember(q) { return function () { Profiles.addSearch(q); }; }

    function showRecent() {
        U.clear(results);
        var recent = Profiles.current().searches || [];
        if (!recent.length) {
            results.appendChild(h('div.search-empty', null,
                h('h3', { text: 'Que veux-tu regarder ?' }),
                h('p.muted', { text: 'Écris avec le clavier à gauche (ou les chiffres de la télécommande). Les résultats s’affichent ici.' })));
            return;
        }
        results.appendChild(h('h3.section-title', { text: 'Recherches récentes' }));
        results.appendChild(h('div.chips', { 'data-group': '' }, recent.map(function (q) {
            return h('button.chip.f', { text: q, onSelect: function () { kb.set(q); run(q); } });
        })));
    }

    function run(q) {
        q = (q || '').trim();
        if (q === last) return;
        last = q;
        var my = ++seq;
        if (q.length < 2) { showRecent(); return; }
        U.clear(results);
        var cats = API.searchCatalogs();
        if (!cats.length) { results.appendChild(h('p.muted', { text: 'Aucun addon de recherche installé.' })); return; }
        var pending = cats.length, found = 0;
        var status = h('p.muted.search-status', { text: 'Recherche…' });
        results.appendChild(status);
        // One row per type, whatever the number of catalogs; duplicates dropped.
        var byType = {};
        function rowFor(type, name) {
            if (byType[type]) return byType[type];
            var r = ui.row({ movie: 'Films', series: 'Séries' }[type] || name || type, []);
            results.insertBefore(r, status);
            byType[type] = { items: r.querySelector('.row-items'), ids: {} };
            return byType[type];
        }
        cats.forEach(function (c) {
            API.catalog(c.addon, c.cat, { search: q }).then(function (metas) {
                if (my !== seq || !metas.length) return;
                var r = rowFor(c.cat.type, c.cat.name);
                metas.slice(0, 30).forEach(function (m) {
                    if (r.ids[m.id]) return;
                    r.ids[m.id] = true;
                    found++;
                    if (!m.type) m.type = c.cat.type;
                    r.items.appendChild(ui.card(m, { sub: U.year(m), onOpen: remember(q) }));
                });
            }, function () {}).then(function () {
                if (my !== seq) return;
                if (--pending === 0) status.textContent = found ? '' : 'Aucun résultat pour « ' + q + ' ».';
            });
        });
    }

    var debounced = U.debounce(run, 600);
    showRecent();
    if (initial) { kb.set(initial); run(initial); }
    else if (document.documentElement.classList.contains('touch')) setTimeout(function () { kb.input.focus(); }, 350);

    return {
        name: 'search', el: el,
        onRawKey: function (e) { return kb.onRawKey(e); },
        onDestroy: function () { debounced.cancel(); }
    };
};
