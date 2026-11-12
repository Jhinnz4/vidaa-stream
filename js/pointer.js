// Mouse and touch on top of the remote navigation (PC, phone, Android app).
// Three modes, switched by the last input used:
//   key   — remote / keyboard: nothing changes (the TV never leaves it);
//   mouse — hover focuses, click activates, ‹ › arrows on rows;
//   touch — tap activates, native scrolling, no focus ring.
var Pointer = (function () {
    'use strict';
    var root = document.documentElement;
    var mode = 'key';
    var backBtn = null;

    function setMode(m) {
        if (m === mode) return;
        mode = m;
        root.classList.toggle('mouse', m === 'mouse');
        root.classList.toggle('touch', m === 'touch');
        root.classList.toggle('pointer', m !== 'key');
        Nav.setRing(m !== 'touch');
        update();
    }

    function topEl() { var v = App.top(); return v ? v.el : null; }

    function focusable(e) {
        var t = topEl(), el = e.target && e.target.closest ? e.target.closest('.f') : null;
        return el && t && t.contains(el) && !el.disabled ? el : null;
    }

    // Floating "‹" on pages without the menu (detail, sources, sub-pages).
    function update() {
        if (!backBtn) {
            backBtn = U.h('button.fab-back.tap', { text: '‹', title: 'Retour' });
            backBtn._onTap = function () { App.back(); };
            document.body.appendChild(backBtn);
        }
        var v = App.top();
        var show = mode !== 'key' && v && App.depth() > 1 && !v.overlay && v.name !== 'player' && !v.el.querySelector('.sidebar');
        backBtn.classList.toggle('hidden', !show);
    }

    document.addEventListener('pointerdown', function (e) {
        setMode(e.pointerType === 'mouse' ? 'mouse' : 'touch');
    }, true);

    // A real mouse move (not a synthetic event from the TV browser) switches to mouse mode.
    var moved = 0, movedAt = 0;
    document.addEventListener('mousemove', function (e) {
        if (Streams.isTV || mode === 'touch') return;
        if (mode !== 'mouse') {
            var now = Date.now();
            if (now - movedAt > 800) moved = 0;
            movedAt = now;
            moved += Math.abs(e.movementX || 0) + Math.abs(e.movementY || 0);
            if (moved < 12) return;
            setMode('mouse');
        }
        var el = focusable(e);
        if (el && el !== Nav.current()) Nav.focus(el, { noScroll: true });
    }, true);

    // Remote / arrow keys bring the focus ring back (not typing in a text field).
    document.addEventListener('keydown', function (e) {
        var ae = document.activeElement;
        if ((ae && ae.tagName === 'INPUT') || /^(Shift|Control|Alt|Meta|AltGraph|CapsLock|Unidentified)$/.test(e.key || '')) return;
        setMode('key');
    }, true);

    document.addEventListener('click', function (e) {
        if (mode === 'key' || e.detail === 0) return;     // keyboard-made clicks
        var tap = e.target.closest ? e.target.closest('.tap') : null;
        if (tap && tap._onTap) { e.preventDefault(); e.stopPropagation(); tap._onTap(e); return; }
        var v = App.top();
        if (!v) return;
        var el = focusable(e);
        if (!el) {
            if (v.overlay && e.target === v.el) { e.preventDefault(); App.back(); }   // click outside a dialog
            else if (v.onTap && v.el.contains(e.target)) v.onTap(e);
            return;
        }
        e.preventDefault();
        e.stopPropagation();
        Nav.focus(el, { noScroll: true });
        if (el.tagName === 'INPUT') { el.focus(); return; }
        if (el._onPoint) { el._onPoint(e); return; }
        if (el._onSelect) el._onSelect(el);
    }, true);

    // Mouse "back" side button.
    document.addEventListener('mouseup', function (e) {
        if (e.button === 3) { e.preventDefault(); App.back(); }
    }, true);

    // Android: the system back button / gesture.
    var cap = window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.App;
    if (cap) {
        cap.addListener('backButton', function () { App.back(); });
    } else if (!Streams.isTV && window.matchMedia && matchMedia('(pointer: coarse)').matches && history.pushState) {
        // Mobile browser / installed web app: keep one history entry to catch "back".
        history.pushState({ sp: 1 }, '');
        window.addEventListener('popstate', function () {
            App.back();
            history.pushState({ sp: 1 }, '');
        });
    }

    return { update: update, mode: function () { return mode; } };
})();
