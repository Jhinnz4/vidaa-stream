// Source picker: every addon's streams, ranked for this TV (playable, French,
// cached first) with the reasons a source may fail spelled out.
Views.streams = function (meta, video, startAt, auto) {
    'use strict';
    auto = auto || {};
    var autoPlayed = false;
    var h = U.h;
    var type = meta.type;
    var vid = video ? video.id : meta.id;
    var all = [];
    var total = 0, done = 0, torrentOnly = 0;
    var showBad = !App.prefs().hideBad;
    var list = h('div.sources', { 'data-group': '' });
    var status = h('p.muted', { text: 'Recherche des sources…' });
    var toggle = h('button.btn.small.f', { onSelect: function () {
        showBad = !showBad;
        render();
    } });
    var title = meta.name + (video ? '  —  S' + video.season + ' · É' + (video.episode || video.number) +
        (video.title || video.name ? '  ' + (video.title || video.name) : '') : '');
    var el = h('div.page', null,
        h('header.page-head', null, h('h2', { text: title }), h('div.page-tools', null, toggle)),
        h('div.sy.page-body', null, status, list));

    function badge(text, cls) { return h('span.badge' + (cls ? '.' + cls : ''), { text: text }); }

    function item(s) {
        var badges = [];
        if (s.cached === true) badges.push(badge('⚡ Instantané', 'good'));
        else if (s.cached === false) badges.push(badge('À télécharger', 'warn'));
        if (s.res) badges.push(badge(s.res));
        Streams.langLabel(s).forEach(function (l) { badges.push(badge(l, l === 'VF' ? 'fr' : '')); });
        if (s.sizeBytes) badges.push(badge(U.fmtSize(s.sizeBytes)));
        if (s.compat === 'bad') badges.push(badge('⚠ ' + s.issues.join(', ') + ' : risque de ne pas être lu', 'bad'));
        else if (s.compat === 'risk') badges.push(badge('⚠ ' + s.issues.join(', '), 'warn'));
        var addonName = (s.addon.manifest && s.addon.manifest.name) || '';
        var el = h('div.source.f', { 'data-vanchor': '', onSelect: function () { play(s); } },
            h('div.source-badges', null, badges),
            h('div.source-title', { text: Streams.title(s) }),
            h('div.muted.small', { text: addonName + ' · ' + String(s.raw.name || '').replace(/\n/g, ' ') }));
        el._stream = s;
        return el;
    }

    function ranked() {
        var p = App.prefs();
        p.hideBad = !showBad;
        return Streams.rank(all, p);
    }

    function render() {
        var focused = Nav.current();
        var keep = focused && list.contains(focused) ? focused._stream : null;
        var r = ranked();
        var hidden = all.filter(function (s) { return s.playable && s.compat === 'bad'; }).length;
        toggle.textContent = showBad ? 'Masquer les sources à risque' : 'Afficher les sources à risque (' + hidden + ')';
        toggle.style.display = hidden ? '' : 'none';
        U.clear(list);
        var refocus = null;
        r.forEach(function (s, i) {
            var e = item(s);
            if (i === 0) e.classList.add('autofocus');
            if (keep === s) refocus = e;
            list.appendChild(e);
        });
        if (done < total) status.textContent = 'Recherche des sources… (' + done + '/' + total + ' addons)';
        else if (!r.length) {
            status.textContent = torrentOnly
                ? 'Aucune source lisible : ' + torrentOnly + ' source(s) torrent sans Real-Debrid. Vérifie que Torrentio est configuré avec ta clé Real-Debrid (sur le PC).'
                : (hidden ? 'Seulement des sources à risque : affiche-les avec le bouton en haut.' : 'Aucune source trouvée.');
        } else status.textContent = '';
        if (App.top() && App.top().el === el) {
            if (refocus) Nav.focus(refocus);
            else if (!focused || !el.contains(focused) || !document.body.contains(focused)) Nav.focusFirst(el);
        }
    }

    function play(s) {
        App.push(Views.player({ meta: meta, video: video, stream: s, startAt: startAt || 0, sources: ranked() }));
    }

    API.streams(type, vid, function (addon, streams) {
        done++;
        streams.forEach(function (raw) {
            var s = Streams.parse(raw, addon, all.length);
            if (!s.playable && raw.infoHash) torrentOnly++;
            all.push(s);
        });
        render();
    }).then(function (n) {
        total = n;
        if (!n) { status.textContent = 'Aucun addon de sources installé (ex. Torrentio avec Real-Debrid).'; return; }
        render();
        // Next episode: same release group as the previous episode, played directly.
        if (auto.binge && !autoPlayed && App.top() && App.top().el === el) {
            var same = ranked().filter(function (s) {
                return s.raw.behaviorHints && s.raw.behaviorHints.bingeGroup === auto.binge;
            })[0];
            if (same) { autoPlayed = true; play(same); }
        }
    });
    total = API.addons().filter(function (a) { return API.supports(a, 'stream', type, vid); }).length;
    render();

    return { name: 'streams', el: el };
};
