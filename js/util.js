// Small helpers shared by every view. Plain scripts (no modules/build) so the
// TV browser runs exactly what is in the repo. ES2017: no ?. / ?? on purpose.
var U = (function () {
    'use strict';

    // h('div.cls1.cls2', {attr: v, onSelect: fn}, children...)
    function h(spec, props) {
        var parts = spec.split('.');
        var el = document.createElement(parts[0] || 'div');
        if (parts.length > 1) el.className = parts.slice(1).join(' ');
        var kids = Array.prototype.slice.call(arguments, 2);
        if (props) {
            for (var k in props) {
                if (!props.hasOwnProperty(k) || props[k] == null) continue;
                var v = props[k];
                if (k === 'onSelect') el._onSelect = v;
                else if (k === 'onFocus') el._onFocus = v;
                else if (k === 'text') el.textContent = v;
                else if (k === 'style') el.style.cssText = v;
                else if (k.indexOf('on') === 0) el.addEventListener(k.slice(2).toLowerCase(), v);
                else if (k === 'className') el.className += (el.className ? ' ' : '') + v;
                else el.setAttribute(k, v);
            }
        }
        append(el, kids);
        return el;
    }

    function append(el, kids) {
        for (var i = 0; i < kids.length; i++) {
            var c = kids[i];
            if (c == null || c === false) continue;
            if (Array.isArray(c)) append(el, c);
            else el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
        }
    }

    function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); }

    function fmtTime(sec) {
        if (!isFinite(sec) || sec < 0) sec = 0;
        sec = Math.floor(sec);
        var hh = Math.floor(sec / 3600), mm = Math.floor((sec % 3600) / 60), ss = sec % 60;
        var p = function (n) { return n < 10 ? '0' + n : '' + n; };
        return (hh ? hh + ':' + p(mm) : mm) + ':' + p(ss);
    }

    function fmtSize(bytes) {
        if (!bytes) return '';
        return bytes >= 1e9 ? (bytes / 1e9).toFixed(1) + ' Go' : Math.round(bytes / 1e6) + ' Mo';
    }

    var store = {
        get: function (k, def) {
            try { var v = localStorage.getItem('sp_' + k); return v == null ? def : JSON.parse(v); }
            catch (e) { return def; }
        },
        set: function (k, v) { try { localStorage.setItem('sp_' + k, JSON.stringify(v)); } catch (e) {} },
        del: function (k) { try { localStorage.removeItem('sp_' + k); } catch (e) {} }
    };

    function fetchJson(url, opts, timeoutMs) {
        opts = opts || {};
        var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
        if (ctrl) opts.signal = ctrl.signal;
        var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, timeoutMs || 15000);
        return fetch(url, opts).then(function (r) {
            clearTimeout(timer);
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        }, function (e) { clearTimeout(timer); throw e; });
    }

    function debounce(fn, ms) {
        var t = null;
        var d = function () {
            var args = arguments, self = this;
            clearTimeout(t);
            t = setTimeout(function () { fn.apply(self, args); }, ms);
        };
        d.cancel = function () { clearTimeout(t); };
        return d;
    }

    function year(meta) {
        if (meta.releaseInfo) return String(meta.releaseInfo);
        if (meta.released) return String(meta.released).slice(0, 4);
        if (meta.year) return String(meta.year);
        return '';
    }

    var toastTimer = null;
    function toast(msg, ms) {
        var el = document.getElementById('toast');
        el.textContent = msg;
        el.classList.remove('hidden');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () { el.classList.add('hidden'); }, ms || 3500);
    }

    return { h: h, clear: clear, fmtTime: fmtTime, fmtSize: fmtSize, store: store,
        fetchJson: fetchJson, debounce: debounce, year: year, toast: toast };
})();
