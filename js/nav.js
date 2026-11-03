// Spatial navigation for the remote. Everything focusable has class "f";
// only the top layer is searched, so dialogs/overlays trap the D-pad.
// Containers with data-group remember their last focused child, so leaving
// a row and coming back lands where you were.
var Nav = (function () {
    'use strict';

    var cur = null;
    var rootFn = function () { return document.body; };

    function visible(el) {
        if (!el.isConnected || el.offsetParent === null || el.disabled) return false;
        var r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
    }

    function focusables(root) {
        return Array.prototype.filter.call(root.querySelectorAll('.f'), visible);
    }

    function center(r) { return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }

    function intervalGap(a1, a2, b1, b2) {
        if (b2 < a1) return a1 - b2;
        if (b1 > a2) return b1 - a2;
        return 0;
    }

    function score(dir, a, b, strict) {
        var ac = center(a), bc = center(b), gap, perp;
        var tol = 4;
        switch (dir) {
            case 'right':
                if (strict ? b.left < a.right - tol : bc.x <= ac.x + 1) return null;
                gap = Math.max(0, b.left - a.right); perp = intervalGap(a.top, a.bottom, b.top, b.bottom);
                return gap + perp * 3 + Math.abs(bc.y - ac.y) * 0.05;
            case 'left':
                if (strict ? b.right > a.left + tol : bc.x >= ac.x - 1) return null;
                gap = Math.max(0, a.left - b.right); perp = intervalGap(a.top, a.bottom, b.top, b.bottom);
                return gap + perp * 3 + Math.abs(bc.y - ac.y) * 0.05;
            case 'down':
                if (strict ? b.top < a.bottom - tol : bc.y <= ac.y + 1) return null;
                gap = Math.max(0, b.top - a.bottom); perp = intervalGap(a.left, a.right, b.left, b.right);
                return gap * 2 + perp + Math.abs(bc.x - ac.x) * 0.05;
            case 'up':
                if (strict ? b.bottom > a.top + tol : bc.y >= ac.y - 1) return null;
                gap = Math.max(0, a.top - b.bottom); perp = intervalGap(a.left, a.right, b.left, b.right);
                return gap * 2 + perp + Math.abs(bc.x - ac.x) * 0.05;
        }
        return null;
    }

    function groupOf(el) { return el && el.parentElement ? el.parentElement.closest('[data-group]') : null; }

    function best(dir, from, list, strict) {
        var a = from.getBoundingClientRect(), bestEl = null, bestScore = Infinity;
        for (var i = 0; i < list.length; i++) {
            if (list[i] === from) continue;
            var s = score(dir, a, list[i].getBoundingClientRect(), strict);
            if (s !== null && s < bestScore) { bestScore = s; bestEl = list[i]; }
        }
        return bestEl;
    }

    function move(dir) {
        var root = rootFn();
        var list = focusables(root);
        if (!cur || !root.contains(cur) || !visible(cur)) { focusFirst(root); return true; }
        if (cur._onMove && cur._onMove(dir) === true) return true;
        var target = best(dir, cur, list, true) || best(dir, cur, list, false);
        if (!target) return false;
        var g = groupOf(target);
        if (g && g !== groupOf(cur) && g._last && g._last !== target && root.contains(g._last) && visible(g._last)) {
            target = g._last;
        }
        focus(target);
        return true;
    }

    function ensureVisible(el) {
        var node = el.parentElement;
        var vAnchor = el.closest('[data-vanchor]') || el;
        while (node && node !== document.body) {
            var cs = node.classList;
            if (cs && (cs.contains('sx') || cs.contains('sy'))) {
                var sr = node.getBoundingClientRect();
                if (cs.contains('sx')) {
                    var er = el.getBoundingClientRect(), pad = Math.min(80, sr.width * 0.1);
                    if (er.left < sr.left + pad) node.scrollLeft -= (sr.left + pad - er.left);
                    else if (er.right > sr.right - pad) node.scrollLeft += (er.right - (sr.right - pad));
                }
                if (cs.contains('sy')) {
                    var ar = (node.contains(vAnchor) ? vAnchor : el).getBoundingClientRect();
                    var vpad = Math.min(60, sr.height * 0.08);
                    if (ar.top < sr.top + vpad) node.scrollTop -= (sr.top + vpad - ar.top);
                    else if (ar.bottom > sr.bottom - vpad) node.scrollTop += (ar.bottom - (sr.bottom - vpad));
                }
            }
            node = node.parentElement;
        }
    }

    function focus(el) {
        if (!el) return;
        if (cur && cur !== el) {
            cur.classList.remove('focused');
            if (cur.tagName === 'INPUT' && document.activeElement === cur) cur.blur();
        }
        cur = el;
        el.classList.add('focused');
        var g = groupOf(el);
        if (g) g._last = el;
        ensureVisible(el);
        if (el._onFocus) el._onFocus(el);
    }

    function focusFirst(root) {
        root = root || rootFn();
        var pref = root.querySelector('.f.autofocus');
        if (pref && visible(pref)) { focus(pref); return; }
        if (root._lastFocus && root.contains(root._lastFocus) && visible(root._lastFocus)) { focus(root._lastFocus); return; }
        var list = focusables(root);
        if (list.length) focus(list[0]);
    }

    function activate() {
        if (!cur) return;
        if (cur.tagName === 'INPUT') { cur.focus(); return; }     // opens the TV keyboard
        if (cur._onSelect) cur._onSelect(cur);
    }

    return {
        setRoot: function (fn) { rootFn = fn; },
        move: move, focus: focus, focusFirst: focusFirst, activate: activate,
        current: function () { return cur; },
        remember: function (root) { if (root && cur && root.contains(cur)) root._lastFocus = cur; }
    };
})();
