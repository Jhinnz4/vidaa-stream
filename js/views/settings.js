Views.settings = function () {
    'use strict';
    var h = U.h, ui = Views.ui;
    var list = h('div.settings', { 'data-group': '' });
    var main = h('main.content.sy', null, h('h2', { text: 'Réglages' }), list);
    var el = h('div.screen', null, ui.sidebar('settings'), main);

    function option(label, desc, values, key) {
        var valEl = h('span.setting-value');
        function refresh() {
            var cur = U.store.get(key, values[0].v);
            var found = values.filter(function (x) { return x.v === cur; })[0] || values[0];
            valEl.textContent = found.label;
        }
        refresh();
        return h('div.setting.f', { 'data-vanchor': '', onSelect: function () {
            var cur = U.store.get(key, values[0].v);
            App.menu({ title: label, items: values.map(function (x) {
                return { label: x.label, selected: x.v === cur, action: function () { U.store.set(key, x.v); refresh(); } };
            }) });
        } }, h('div', null, h('div.setting-label', { text: label }), h('div.muted.small', { text: desc })), valEl);
    }

    list.appendChild(option('Langue préférée', 'Met les sources en français en premier et choisit la piste française quand la TV le permet.',
        [{ v: true, label: 'Français' }, { v: false, label: 'Indifférent' }], 'preferFrench'));
    list.appendChild(option('Qualité préférée', '1080p démarre plus vite et passe mieux en Wi-Fi.',
        [{ v: '1080p', label: '1080p' }, { v: '4K', label: '4K' }], 'quality'));
    list.appendChild(option('Sources à risque', 'DTS, TrueHD, REMUX, AV1 : souvent illisibles par le navigateur de la TV.',
        [{ v: false, label: 'Affichées en bas' }, { v: true, label: 'Masquées' }], 'hideBad'));
    list.appendChild(option('Sous-titres par défaut', 'Charge automatiquement des sous-titres au lancement.',
        [{ v: 'off', label: 'Aucun' }, { v: 'fr', label: 'Français' }], 'subsDefault'));
    list.appendChild(h('div.setting.f', { 'data-vanchor': '', onSelect: function () {
        U.toast('Mise à jour des addons…');
        API.loadAddons().then(function () { return API.loadLibrary(); }).then(function () { App.boot(); });
    } }, h('div', null, h('div.setting-label', { text: 'Recharger les addons' }),
        h('div.muted.small', { text: 'Après avoir installé ou configuré un addon sur le PC.' }))));
    list.appendChild(h('div.setting.f', { 'data-vanchor': '', onSelect: function () {
        App.dialog({ title: 'Se déconnecter ?', buttons: [
            { label: 'Déconnexion', action: function () { API.logout(); App.reset(Views.login()); } },
            { label: 'Annuler', autofocus: true }] });
    } }, h('div', null, h('div.setting-label', { text: 'Se déconnecter' }),
        h('div.muted.small', { text: API.addons().length + ' addons installés sur ce compte' }))));
    list.appendChild(h('p.muted.small', { text: 'Stream+ v1 · ' + navigator.userAgent }));

    return { name: 'settings', el: el };
};
