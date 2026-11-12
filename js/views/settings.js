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

    section('Accueil (' + me.name + ')');
    list.appendChild(row('Personnaliser l’accueil', 'Choisir et réordonner les rangées de catalogues.', null,
        function () { App.push(Views.homeEdit()); }));

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

// Home rows editor: OK shows/hides a row, ↑/↓ buttons move it.
Views.homeEdit = function () {
    'use strict';
    var h = U.h;
    var listEl = h('div.home-edit', { 'data-group': '' });
    var el = h('div.page', null,
        h('header.page-head', null, h('h2', { text: 'Personnaliser l’accueil' }),
            h('div.page-tools', null, h('button.btn.small.f', { text: 'Réinitialiser', onSelect: function () {
                Profiles.setPref('homeRows', null);
                render(null, null);
                U.toast('Accueil réinitialisé');
            } }))),
        h('p.muted', { text: 'OK sur une rangée : l’afficher ou la masquer. Les flèches à droite la déplacent. Pris en compte au retour à l’accueil.' }),
        h('div.sy.page-body', null, listEl));
    var typeName = { movie: 'Films', series: 'Séries' };

    function saveFrom(rows) {
        Profiles.setPref('homeRows', {
            order: rows.map(function (r) { return r.key; }),
            hidden: rows.filter(function (r) { return r.hidden; }).map(function (r) { return r.key; })
        });
    }

    function render(focusKey, focusPart) {
        var rows = Views.ui.homeRows();
        U.clear(listEl);
        var target = null;
        rows.forEach(function (r, i) {
            function move(d) {
                var j = i + d;
                if (j < 0 || j >= rows.length) return;
                var tmp = rows[i]; rows[i] = rows[j]; rows[j] = tmp;
                saveFrom(rows);
                render(r.key, d < 0 ? 'up' : 'down');
            }
            var name = (r.c.cat.name || r.c.cat.id) + ' — ' + (typeName[r.c.cat.type] || r.c.cat.type);
            var toggle = h('div.setting.f', { onSelect: function () {
                r.hidden = !r.hidden;
                saveFrom(rows);
                render(r.key, 'toggle');
            } }, h('div', null, h('div.setting-label', { text: name }),
                h('div.muted.small', { text: (r.c.addon.manifest && r.c.addon.manifest.name) || '' })),
                h('span.setting-value', { text: r.hidden ? 'Masquée' : 'Affichée' }));
            var up = h('button.btn.small.f', { text: '↑', onSelect: function () { move(-1); } });
            var down = h('button.btn.small.f', { text: '↓', onSelect: function () { move(1); } });
            if (i === 0) up.disabled = true;
            if (i === rows.length - 1) down.disabled = true;
            listEl.appendChild(h('div.home-edit-row' + (r.hidden ? '.off' : ''), { 'data-vanchor': '' }, toggle, up, down));
            if (r.key === focusKey) target = focusPart === 'up' ? (up.disabled ? toggle : up) : focusPart === 'down' ? (down.disabled ? toggle : down) : toggle;
        });
        if (target) Nav.focus(target);
        else if (!focusKey && listEl.querySelector('.f')) listEl.querySelector('.f').classList.add('autofocus');
    }
    render(null, null);

    return { name: 'homeEdit', el: el };
};
