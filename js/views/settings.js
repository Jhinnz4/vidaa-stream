Views.settings = function () {
    'use strict';
    var h = U.h, ui = Views.ui;
    var list = h('div.settings', { 'data-group': '' });
    var main = h('main.content.browse', null, h('h2.page-title', { text: 'Réglages' }), h('div.browse-body.sy', null, list));
    var el = h('div.screen', null, ui.sidebar('settings'), main);
    var me = Profiles.current();

    function row(label, desc, valueEl, onSelect) {
        return h('div.setting.f', { 'data-vanchor': '', onSelect: onSelect },
            h('div', null, h('div.setting-label', { text: label }), desc ? (typeof desc === 'string' ? h('div.muted.small', { text: desc }) : desc) : null),
            valueEl || null);
    }

    function section(title) { list.appendChild(h('h3.section-title', { text: title })); }

    // Per-profile preference with a pick-one menu.
    function option(label, desc, values, key) {
        var valEl = h('span.setting-value');
        function refresh() {
            var cur = Profiles.prefs()[key];
            var found = values.filter(function (x) { return x.v === cur; })[0] || values[0];
            valEl.textContent = found.label;
        }
        refresh();
        return row(label, desc, valEl, function () {
            var cur = Profiles.prefs()[key];
            App.menu({ title: label, items: values.map(function (x) {
                return { label: x.label, selected: x.v === cur, action: function () { Profiles.setPref(key, x.v); refresh(); } };
            }) });
        });
    }

    section('Profil');
    var first = row('Modifier « ' + me.name + ' »', 'Nom et avatar', h('span.setting-value', null, ui.avatar(me, 'small')),
        function () { App.push(Views.profileEdit(me)); });
    first.classList.add('autofocus');
    list.appendChild(first);
    list.appendChild(row('Changer de profil', Profiles.list().length + ' profil(s) sur cette TV', null,
        function () { App.reset(Views.profiles()); }));

    section('Lecture (' + me.name + ')');
    list.appendChild(option('Langue préférée', 'Met les sources en français en premier et choisit la piste française quand la TV le permet.',
        [{ v: true, label: 'Français' }, { v: false, label: 'Indifférent' }], 'preferFrench'));
    list.appendChild(option('Qualité préférée', '1080p démarre plus vite et passe mieux en Wi-Fi.',
        [{ v: '1080p', label: '1080p' }, { v: '4K', label: '4K' }], 'quality'));
    list.appendChild(option('Sources à risque', 'DTS, TrueHD, REMUX, AV1 : souvent illisibles par le navigateur de la TV.',
        [{ v: false, label: 'Affichées en bas' }, { v: true, label: 'Masquées' }], 'hideBad'));
    list.appendChild(option('Sous-titres par défaut', 'Charge automatiquement des sous-titres au lancement.',
        [{ v: 'off', label: 'Aucun' }, { v: 'fr', label: 'Français' }], 'subsDefault'));

    section('Compte et sources');
    list.appendChild(row('Recharger les addons', 'Après avoir installé ou configuré un addon sur le PC.', null, function () {
        U.toast('Mise à jour des addons…');
        App.boot();
    }));
    var deadDesc = h('div.muted.small');
    function refreshDead() {
        var n = Streams.deadCount();
        deadDesc.textContent = n ? n + ' source(s) détectée(s) comme indisponibles sur le debrid sont masquées.' : 'Aucune source masquée.';
    }
    refreshDead();
    list.appendChild(row('Réafficher les sources indisponibles', deadDesc, null, function () {
        Streams.clearDead();
        refreshDead();
        U.toast('Les sources masquées sont de nouveau affichées');
    }));
    list.appendChild(row('Se déconnecter', API.addons().length + ' addons installés sur ce compte', null, function () {
        App.dialog({ title: 'Se déconnecter ?', buttons: [
            { label: 'Déconnexion', action: function () { API.logout(); App.reset(Views.login()); } },
            { label: 'Annuler', autofocus: true }] });
    }));
    list.appendChild(h('p.muted.small.version', { text: 'Stream+ v2 · ' + navigator.userAgent }));

    return { name: 'settings', el: el };
};
