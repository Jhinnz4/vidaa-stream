// Search: the input keeps the TV keyboard open — results render below it
// without ever moving DOM focus. Typing is debounced; OK searches at once.
Views.search = function () {
    'use strict';
    var h = U.h, ui = Views.ui;
    var input = h('input.search-input.f.autofocus', { type: 'text', placeholder: 'Titre d’un film ou d’une série…' });
    var results = h('div.search-results');
    var hint = h('p.muted', { text: 'Appuie sur OK pour écrire, puis flèche bas pour parcourir les résultats.' });
    var main = h('main.content.sy', null, h('div.search-bar', { 'data-vanchor': '' }, input), hint, results);
    var el = h('div.screen', null, ui.sidebar('search'), main);
    var last = '', seq = 0, pollTimer = null;

    function run(q) {
        q = (q || '').trim();
        if (q === last) return;
        last = q;
        var my = ++seq;
        U.clear(results);
        if (q.length < 2) { hint.classList.remove('hidden'); return; }
        hint.classList.add('hidden');
        var cats = API.searchCatalogs();
        if (!cats.length) { results.appendChild(h('p.muted', { text: 'Aucun addon de recherche installé.' })); return; }
        var pending = cats.length, found = 0;
        var status = h('p.muted', { text: 'Recherche…' });
        results.appendChild(status);
        cats.forEach(function (c) {
            var slot = h('div');
            results.insertBefore(slot, status);
            API.catalog(c.addon, c.cat, { search: q }).then(function (metas) {
                if (my !== seq) return;
                if (metas.length) {
                    found += metas.length;
                    var title = { movie: 'Films', series: 'Séries' }[c.cat.type] || (c.cat.name || c.cat.type);
                    slot.appendChild(ui.row(title, metas.slice(0, 30).map(function (m) {
                        if (!m.type) m.type = c.cat.type;
                        return ui.card(m, { sub: U.year(m) });
                    })));
                }
            }, function () {}).then(function () {
                if (my !== seq) return;
                if (--pending === 0) status.textContent = found ? '' : 'Aucun résultat pour « ' + q + ' ».';
            });
        });
    }

    var debounced = U.debounce(run, 1200);
    input._onSubmit = function (v) { debounced.cancel(); run(v); };
    input.addEventListener('input', function () { debounced(input.value); });

    return {
        name: 'search', el: el,
        onShow: function () {
            // Some TV keyboards set .value without firing "input": watch it.
            var seen = input.value;
            clearInterval(pollTimer);
            pollTimer = setInterval(function () {
                if (input.value !== seen) { seen = input.value; debounced(seen); }
            }, 150);
        },
        onHide: function () { clearInterval(pollTimer); },
        onDestroy: function () { clearInterval(pollTimer); debounced.cancel(); }
    };
};
