// On-screen keyboard driven by the D-pad (no TV keyboard popping up).
// Remote digits and a real keyboard also type into it.
var Keyboard = function (opts) {
    'use strict';
    opts = opts || {};
    var h = U.h;
    var value = opts.value || '';
    var max = opts.maxLength || 40;
    var display = h('div.kb-display');
    var text = h('span.kb-text');
    var caret = h('span.kb-caret');
    display.appendChild(text);
    display.appendChild(caret);

    var rows = opts.accents
        ? ['abcdef', 'ghijkl', 'mnopqr', 'stuvwx', 'yz1234', '567890', 'éèàç-\'']
        : ['abcdef', 'ghijkl', 'mnopqr', 'stuvwx', 'yz1234', '567890'];

    function render() {
        text.textContent = value;
        display.classList.toggle('empty', !value);
        if (!value) text.textContent = opts.placeholder || '';
    }

    function emit() { render(); if (opts.onChange) opts.onChange(value); }

    function type(ch) {
        if (value.length >= max) return;
        if (opts.capitalize && (!value || /\s$/.test(value))) ch = ch.toUpperCase();
        value += ch;
        emit();
    }

    function key(label, cls, action) {
        return h('div.key.f' + (cls ? '.' + cls : ''), { onSelect: action }, label);
    }

    var grid = h('div.kb-grid', { 'data-group': '' },
        key('Espace', 'wide', function () { if (value && !/\s$/.test(value)) type(' '); }),
        key('⌫', 'wide', function () { value = value.slice(0, -1); emit(); }));
    rows.forEach(function (r, ri) {
        r.split('').forEach(function (ch, ci) {
            var k = key(ch, null, function () { type(ch); });
            if (ri === 0 && ci === 0) k.classList.add('autofocus');
            grid.appendChild(k);
        });
    });
    grid.appendChild(key('Tout effacer', 'full', function () { value = ''; emit(); }));

    var el = h('div.kb', null, display, grid);
    render();

    return {
        el: el,
        value: function () { return value; },
        set: function (v) { value = v || ''; emit(); },
        // Physical keys: letters/digits from a real keyboard or the remote's number pad.
        onRawKey: function (e) {
            var ch = e.key && e.key.length === 1 ? e.key.toLowerCase() : null;
            if (!ch && e.keyCode >= 48 && e.keyCode <= 57) ch = String(e.keyCode - 48);
            if (ch && /[a-z0-9 éèàç'\-]/.test(ch)) { if (ch === ' ') { if (value && !/\s$/.test(value)) type(' '); } else type(ch); return true; }
            return false;
        }
    };
};

// Line icons for the sidebar (inline SVG strings, currentColor).
var Icons = (function () {
    'use strict';
    function svg(p) {
        return '<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + p + '</svg>';
    }
    return {
        home: svg('<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>'),
        search: svg('<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>'),
        movie: svg('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9h18M8 5v4M16 5v4"/>'),
        series: svg('<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M8 21h8M12 18v3"/>'),
        list: svg('<path d="M12 5v14M5 12h14"/>'),
        settings: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
        check: svg('<path d="M5 12l5 5L20 7"/>'),
        play: '<svg viewBox="0 0 24 24" width="100%" height="100%" fill="currentColor"><path d="M7 4.5v15l13-7.5z"/></svg>',
        edit: svg('<path d="M4 20h4L19 9l-4-4L4 16z"/>')
    };
})();
