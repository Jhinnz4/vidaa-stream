// Login without typing a password on the TV: show a code, the user enters it
// on link.stremio.com (phone or PC), we poll until the account is linked.
Views.login = function () {
    'use strict';
    var h = U.h;
    var codeEl = h('div.login-code', { text: '····' });
    var qr = h('img.login-qr', { alt: '' });
    var status = h('p.muted', { text: 'Génération du code…' });
    var pollTimer = null, renewTimer = null, alive = true;

    function newCode() {
        clearInterval(pollTimer);
        clearTimeout(renewTimer);
        API.linkCreate().then(function (r) {
            if (!alive) return;
            codeEl.textContent = r.code;
            if (r.qrcode) qr.src = r.qrcode;
            status.textContent = 'En attente de validation…';
            pollTimer = setInterval(function () {
                API.linkRead(r.code).then(function (key) {
                    if (!key || !alive) return;
                    clearInterval(pollTimer);
                    U.store.set('authKey', key);
                    App.boot();
                });
            }, 3000);
            renewTimer = setTimeout(newCode, 9 * 60 * 1000);   // codes expire
        }, function (e) {
            status.textContent = 'Erreur réseau (' + e.message + '). Nouvel essai…';
            renewTimer = setTimeout(newCode, 5000);
        });
    }

    var el = h('div.login', null,
        h('h1', { text: 'Stream+' }),
        h('p', { text: 'Connecte ton compte Stremio :' }),
        h('ol', null,
            h('li', null, 'Sur ton téléphone ou ton PC, va sur ', h('b', { text: 'link.stremio.com' }), ' (ou scanne le QR code)'),
            h('li', { text: 'Connecte-toi et saisis ce code :' })),
        h('div.login-row', null, codeEl, qr),
        status,
        h('button.btn.f.autofocus', { text: 'Nouveau code', onSelect: newCode }));

    newCode();
    return {
        el: el,
        onDestroy: function () { alive = false; clearInterval(pollTimer); clearTimeout(renewTimer); }
    };
};
