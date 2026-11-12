// "Qui regarde ?" picker + profile editor (name via on-screen keyboard, avatar grid).
Views.profiles = function () {
    'use strict';
    var h = U.h, ui = Views.ui;
    var manage = false;
    var tiles = h('div.profile-tiles', { 'data-group': '' });
    var title = h('h1', { text: 'Qui regarde ?' });
    var manageBtn = h('button.btn.f', { onSelect: function () { manage = !manage; render(); } });
    var el = h('div.profiles', null, title, tiles, manageBtn);

    function render() {
        U.clear(tiles);
        var cur = Profiles.current();
        title.textContent = manage ? 'Gérer les profils' : 'Qui regarde ?';
        manageBtn.textContent = manage ? 'Terminé' : 'Gérer les profils';
        Profiles.list().forEach(function (p) {
            tiles.appendChild(h('div.profile-tile.f' + (p.id === cur.id ? '.autofocus' : ''), { onSelect: function () {
                if (manage) { App.push(Views.profileEdit(p)); return; }
                Profiles.select(p.id);
                App.reset(Views.home());
            } },
            h('div.profile-pic', null, ui.avatar(p), manage ? h('div.profile-edit', { html: Icons.edit }) : null),
            h('div.profile-name', { text: p.name })));
        });
        if (Profiles.list().length < Profiles.MAX) {
            tiles.appendChild(h('div.profile-tile.f', { onSelect: function () { App.push(Views.profileEdit(null)); } },
                h('div.profile-pic.profile-add', { html: Icons.list }), h('div.profile-name', { text: 'Ajouter' })));
        }
    }
    render();
    return { name: 'profiles', el: el, onShow: function () { render(); } };
};

Views.profileEdit = function (profile) {
    'use strict';
    var h = U.h;
    var isNew = !profile;
    var avatarIdx = profile ? profile.avatar : Profiles.list().length % Profiles.AVATARS;
    var preview = h('img.avatar.big', { alt: '' });
    var kb = Keyboard({ value: profile ? profile.name : '', placeholder: 'Nom du profil', maxLength: 16,
        capitalize: true, accents: true });
    var avatars = h('div.avatar-grid', { 'data-group': '' });

    function showPreview() { preview.src = Profiles.avatarSrc(avatarIdx); }

    for (var i = 0; i < Profiles.AVATARS; i++) (function (i) {
        avatars.appendChild(h('div.avatar-pick.f' + (i === avatarIdx ? '.selected' : ''), { onSelect: function () {
            avatarIdx = i;
            Array.prototype.forEach.call(avatars.children, function (c, j) { c.classList.toggle('selected', j === i); });
            showPreview();
        } }, h('img.avatar', { src: Profiles.avatarSrc(i), alt: '' })));
    })(i);
    showPreview();

    function saveIt() {
        var name = kb.value().trim();
        if (!name) { U.toast('Donne un nom au profil'); return; }
        if (isNew) Profiles.add({ name: name, avatar: avatarIdx });
        else Profiles.update(profile.id, { name: name, avatar: avatarIdx });
        App.pop();
    }

    var buttons = h('div.actions', { 'data-group': '' },
        h('button.btn.primary.f', { text: 'Enregistrer', onSelect: saveIt }),
        h('button.btn.f', { text: 'Annuler', onSelect: function () { App.pop(); } }),
        !isNew && !profile.owner ? h('button.btn.danger.f', { text: 'Supprimer', onSelect: function () {
            App.dialog({ title: 'Supprimer « ' + profile.name + ' » ?',
                text: 'Sa progression et sa liste seront effacées de cet appareil.',
                buttons: [{ label: 'Supprimer', action: function () { Profiles.remove(profile.id); App.pop(); } },
                    { label: 'Annuler', autofocus: true }] });
        } }) : null);

    var el = h('div.profile-editor', null,
        h('div.pe-left', null,
            h('h1', { text: isNew ? 'Nouveau profil' : 'Modifier le profil' }),
            preview,
            profile && profile.owner ? h('p.muted.small', { text: 'Profil principal : synchronisé avec ton compte Stremio.' })
                : h('p.muted.small', { text: 'Progression et liste gardées sur cette TV.' }),
            buttons),
        h('div.pe-mid', null, kb.el),
        h('div.pe-right', null, h('h3.section-title', { text: 'Avatar' }), avatars));

    return { name: 'profileEdit', el: el, onRawKey: function (e) { return kb.onRawKey(e); } };
};
