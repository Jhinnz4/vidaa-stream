// App shell: a stack of layers (views / dialogs), remote key dispatch, boot.
var Views = {};
var App = (function () {
    'use strict';

    var stack = [];
    var rootEl;
    var keyCount = 0;     // lets views know whether the user has started navigating

    var KEYS = {
        37: 'left', 38: 'up', 39: 'right', 40: 'down', 13: 'enter',
        8: 'back', 461: 'back', 10009: 'back', 27: 'back',
        415: 'play', 19: 'pause', 179: 'playpause', 10252: 'playpause', 413: 'stop',
        417: 'ff', 412: 'rw', 403: 'red', 404: 'green', 405: 'yellow', 406: 'blue', 457: 'info'
    };

    function top() { return stack[stack.length - 1]; }

    function push(view) {
        var prev = top();
        if (prev) {
            Nav.remember(prev.el);
            if (!view.overlay) prev.el.classList.add('hidden');
            if (prev.onHide) prev.onHide();
        }
        view.el.classList.add('layer');
        if (view.overlay) view.el.classList.add('overlay');
        rootEl.appendChild(view.el);
        stack.push(view);
        if (view.onShow) view.onShow();
        Nav.focusFirst(view.el);
        changed();
        return view;
    }

    function pop() {
        var v = stack.pop();
        if (!v) return;
        if (v.onDestroy) v.onDestroy();
        if (v.el.parentNode) v.el.parentNode.removeChild(v.el);
        var prev = top();
        if (prev) {
            prev.el.classList.remove('hidden');
            if (prev.onShow) prev.onShow();
            Nav.focusFirst(prev.el);
        }
        changed();
    }
    function changed() { if (window.Pointer) Pointer.update(); }

    // Replace the whole stack (login → home, logout → login).
    function reset(view) {
        while (stack.length) {
            var v = stack.pop();
            if (v.onDestroy) v.onDestroy();
            if (v.el.parentNode) v.el.parentNode.removeChild(v.el);
        }
        push(view);
    }

    function back() {
        var v = top();
        if (v && v.onBack && v.onBack() === true) return;
        if (stack.length > 1) { pop(); return; }
        dialog({ title: 'Quitter Stream+ ?', buttons: [
            { label: 'Quitter', action: exit },
            { label: 'Annuler', autofocus: true }
        ] });
    }

    function exit() {
        var cap = window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.App;
        if (cap) { cap.exitApp(); return; }
        try { window.close(); } catch (e) {}
        setTimeout(function () { try { history.go(-(history.length - 1)); } catch (e) {} }, 300);
    }

    // ── Dialogs & pick-one menus (overlay layers) ──
    function dialog(opts) {
        var h = U.h;
        var view = { overlay: true };
        var buttons = (opts.buttons || [{ label: 'OK' }]).map(function (b) {
            return h('button.btn.f' + (b.autofocus ? '.autofocus' : ''), { text: b.label, onSelect: function () {
                pop();
                if (b.action) b.action();
            } });
        });
        view.el = h('div', null, h('div.dialog',
            null,
            opts.title ? h('h2', { text: opts.title }) : null,
            opts.text ? h('p', { text: opts.text }) : null,
            h('div.dialog-buttons', null, buttons)));
        return push(view);
    }

    function menu(opts) {
        var h = U.h;
        var view = { overlay: true };
        var items = opts.items.map(function (it) {
            return h('div.menu-item.f' + (it.selected ? '.autofocus.selected' : ''), { onSelect: function () {
                pop();
                if (it.action) it.action();
            } }, h('span', { text: (it.selected ? '✓ ' : '') + it.label }), it.sub ? h('small', { text: it.sub }) : null);
        });
        view.el = h('div', null, h('div.menu.sy',
            null,
            h('h2', { text: opts.title }),
            opts.note ? h('p.menu-note', { text: opts.note }) : null,
            items.length ? items : h('p', { text: opts.empty || 'Rien à afficher' })));
        return push(view);
    }

    // ── Remote keys ──
    function onKey(e) {
        var name = KEYS[e.keyCode];
        keyCount++;
        var ae = document.activeElement;
        var typing = ae && ae.tagName === 'INPUT';

        if (typing) {
            if (name === 'up' || name === 'down') { e.preventDefault(); ae.blur(); Nav.move(name); return; }
            if (name === 'enter') { e.preventDefault(); ae.blur(); if (ae._onSubmit) ae._onSubmit(ae.value); return; }
            if (e.keyCode === 461 || e.keyCode === 10009 || e.keyCode === 27 || (e.keyCode === 8 && !ae.value)) {
                e.preventDefault(); ae.blur(); return;
            }
            return;                                       // characters, caret moves, backspace
        }
        var v = top();
        if (!name) {
            if (v && v.onRawKey && !e.ctrlKey && !e.altKey && !e.metaKey && v.onRawKey(e) === true) e.preventDefault();
            return;
        }
        e.preventDefault();
        if (v && v.onKey && v.onKey(name, e) === true) return;
        if (name === 'back') { back(); return; }
        if (name === 'enter') { Nav.activate(); return; }
        if (name === 'up' || name === 'down' || name === 'left' || name === 'right') Nav.move(name);
    }

    function scale() {
        // 1rem = 1/54 of the screen height (20px on a 1080p viewport).
        // Phones: sized on the short side instead, with a readable minimum.
        var w = window.innerWidth, hgt = window.innerHeight, root = document.documentElement;
        var phone = !Streams.isTV && Math.min(w, hgt) < 600;
        var px = hgt / 54;
        if (phone) px = Math.max(13, Math.min(17, Math.min(w, hgt) / 26));
        else if (!Streams.isTV) px = Math.max(12, Math.min(px, w / 64));
        root.style.fontSize = px + 'px';
        root.classList.toggle('phone', phone);
        root.classList.toggle('portrait', phone && hgt > w);
    }

    function start() {
        rootEl = document.getElementById('root');
        scale();
        window.addEventListener('resize', scale);
        Nav.setRoot(function () { var v = top(); return v ? v.el : document.body; });
        document.addEventListener('keydown', onKey, true);
        if (!API.authKey()) { reset(Views.login()); return; }
        boot();
    }

    function boot() {
        var loading = U.h('div.splash', null, U.h('div.spinner'), U.h('p', { text: 'Chargement…' }));
        reset({ el: loading });
        API.loadAddons().then(function () {
            return API.loadLibrary();
        }).then(function () {
            // Every launch starts on "Qui regarde ?".
            reset(Views.profiles());
        }).catch(function (e) {
            if (!API.authKey()) { reset(Views.login()); return; }
            reset({ el: U.h('div.splash', null, U.h('p', { text: 'Connexion impossible : ' + e.message }),
                U.h('button.btn.f.autofocus', { text: 'Réessayer', onSelect: boot })) });
        });
    }

    function prefs() { return Profiles.prefs(); }

    // Sidebar sections live one level above home: back always returns home.
    function section(factory) {
        while (stack.length > 1 && top().name !== 'home') pop();
        if (factory) push(factory());
    }

    return { start: start, boot: boot, push: push, pop: pop, reset: reset, back: back, top: top,
        depth: function () { return stack.length; },
        dialog: dialog, menu: menu, prefs: prefs, exit: exit, section: section,
        keyCount: function () { return keyCount; } };
})();
