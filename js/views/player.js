// Player: the TV browser's own <video> decoder fed straight from the debrid
// HTTPS link. Remote: ←/→ seek (repeat = bigger jumps), OK play/pause +
// controls, ↑/↓ controls, Back hides controls then leaves.
Views.player = function (opts) {
    'use strict';
    var h = U.h;
    var meta = opts.meta, video = opts.video, stream = opts.stream;
    var videoId = video ? video.id : meta.id;
    var prefs = App.prefs();

    var v = h('video.player-video', { preload: 'auto' });
    var subsEl = h('div.player-subs');
    var spinner = h('div.spinner.player-spinner');
    var fill = h('div.progress-fill'), buf = h('div.progress-buf'), knob = h('div.progress-knob');
    var progress = h('div.progress.f', null, buf, fill, knob);
    var tCur = h('span', { text: '0:00' }), tDur = h('span', { text: '0:00' });
    var playBtn = h('button.btn.f', { text: '❚❚', onSelect: togglePlay });
    var info = h('div.osd-info.muted');
    var nextVid = nextVideo();
    var osd = h('div.osd.hidden', null,
        h('div.osd-top', null,
            h('div', null, h('div.osd-title', { text: meta.name }),
                video ? h('div.muted', { text: 'S' + video.season + ' · É' + (video.episode || video.number) + '  ' + (video.title || video.name || '') }) : null),
            info),
        h('div.osd-bottom', null,
            h('div.osd-times', null, tCur, progress, tDur),
            h('div.osd-buttons', { 'data-group': '' },
                playBtn,
                h('button.btn.f', { text: 'Audio', onSelect: audioMenu }),
                h('button.btn.f', { text: 'Sous-titres', onSelect: subsMenu }),
                h('button.btn.f', { text: 'Sources', onSelect: function () { leave(); } }),
                nextVid ? h('button.btn.f', { text: 'Épisode suivant ▶', onSelect: playNext }) : null)));
    var errBox = h('div.player-error.hidden');
    var seekBadge = h('div.seek-badge.hidden');
    var el = h('div.player', null, v, subsEl, spinner, seekBadge, osd, errBox);

    var hideTimer = null, saveTimer = null, subsTimer = null, stallTimer = null;
    var cues = [], subsList = null, subsChosen = null, lastSubText = '';
    var seekTarget = null, seekTimer = null, lastSeekKey = 0, seekStreak = 0;
    var destroyed = false, frenchPicked = false;

    // ── Playback ──
    function start() {
        v.src = stream.raw.url;
        v.play().catch(function () {});
        saveTimer = setInterval(save, 20000);
        subsTimer = setInterval(drawSubs, 200);
        loadSubsList();
    }

    function togglePlay() { if (v.paused) v.play().catch(function () {}); else v.pause(); }

    function save() {
        if (!v.duration || !isFinite(v.duration) || v.currentTime < 5) return;
        Lib.saveProgress(meta, videoId, v.currentTime, v.duration);
    }

    function leave() {
        save();
        App.pop();
    }

    // Debrid placeholder clip (≈30 s "not available" video) instead of the film.
    function looksLikePlaceholder() {
        var d = v.duration;
        if (!d || !isFinite(d) || d > 90) return false;
        var rt = parseInt(String(meta.runtime || ''), 10);
        return !(rt && rt < 3);                      // genuinely short content: keep it
    }

    function skipUnavailable() {
        Streams.markDead(stream);
        var rest = opts.sources.filter(function (s) { return s !== stream && !Streams.isDead(s); });
        var next = rest[0];
        if (!next) {
            showError(stream.cached === false
                ? 'Real-Debrid télécharge encore ce fichier. Réessaie dans quelques minutes ou choisis une autre source.'
                : 'Cette source n’est plus disponible sur Real-Debrid et il n’y en a pas d’autre.');
            return;
        }
        U.toast(stream.cached === false ? 'Pas encore prêt sur Real-Debrid : source suivante…'
            : 'Source indisponible sur Real-Debrid : source suivante…');
        App.pop();
        App.push(Views.player({ meta: meta, video: video, stream: next, startAt: opts.startAt, sources: rest }));
    }

    v.addEventListener('loadedmetadata', function () {
        if (looksLikePlaceholder()) { v.muted = true; v.pause(); skipUnavailable(); return; }
        if (opts.startAt > 5 && opts.startAt < v.duration - 30) v.currentTime = opts.startAt;
        pickFrenchAudio();
        updateInfo();
    });
    if (v.audioTracks && v.audioTracks.addEventListener) v.audioTracks.addEventListener('addtrack', function () { pickFrenchAudio(); updateInfo(); });
    v.addEventListener('timeupdate', updateTime);
    v.addEventListener('progress', updateTime);
    v.addEventListener('playing', function () { spinner.classList.add('hidden'); clearTimeout(stallTimer); playBtn.textContent = '❚❚'; });
    v.addEventListener('pause', function () { if (destroyed) return; playBtn.textContent = '▶'; showOsd(); save(); });
    v.addEventListener('waiting', function () {
        spinner.classList.remove('hidden');
        clearTimeout(stallTimer);
        stallTimer = setTimeout(function () { showError('La vidéo ne charge plus (source lente ou bloquée).'); }, 40000);
    });
    v.addEventListener('ended', function () { save(); if (nextVid) playNext(); else leave(); });
    v.addEventListener('error', function () {
        var code = v.error ? v.error.code : 0;
        var msg = {
            2: 'Erreur réseau pendant la lecture.',
            3: 'La TV n’arrive pas à décoder cette vidéo (codec non pris en charge).',
            4: 'Format non pris en charge par la TV.'
        }[code] || 'Lecture impossible.';
        if (stream.issues.length) msg += ' Cette source contient : ' + stream.issues.join(', ') + '.';
        showError(msg);
    });

    function updateTime() {
        var d = v.duration;
        if (!d || !isFinite(d)) return;
        var t = seekTarget !== null ? seekTarget : v.currentTime;
        var pct = Math.max(0, Math.min(100, t / d * 100));
        fill.style.width = pct + '%';
        knob.style.left = pct + '%';
        if (v.buffered.length) buf.style.width = Math.min(100, v.buffered.end(v.buffered.length - 1) / d * 100) + '%';
        tCur.textContent = U.fmtTime(t);
        tDur.textContent = U.fmtTime(d);
    }

    function updateInfo() {
        var bits = [];
        if (v.videoWidth) bits.push(v.videoWidth + '×' + v.videoHeight);
        var at = v.audioTracks;
        bits.push(!at ? 'audio : piste unique (TV)' : at.length + ' piste' + (at.length > 1 ? 's' : '') + ' audio');
        info.textContent = bits.join('  ·  ');
    }

    // ── Seeking: presses accumulate, applied once the remote goes quiet ──
    function seekBy(dir) {
        if (!v.duration || !isFinite(v.duration)) return;
        var now = Date.now();
        seekStreak = now - lastSeekKey < 600 ? seekStreak + 1 : 0;
        lastSeekKey = now;
        var step = seekStreak < 3 ? 10 : seekStreak < 8 ? 30 : 60;
        var base = seekTarget !== null ? seekTarget : v.currentTime;
        seekTarget = Math.max(0, Math.min(v.duration - 2, base + dir * step));
        seekBadge.textContent = (seekTarget >= v.currentTime ? '» ' : '« ') + U.fmtTime(seekTarget);
        seekBadge.classList.remove('hidden');
        updateTime();
        showOsd(true);
        clearTimeout(seekTimer);
        seekTimer = setTimeout(function () {
            v.currentTime = seekTarget;
            seekTarget = null;
            seekBadge.classList.add('hidden');
            if (v.paused) v.play().catch(function () {});
        }, 700);
    }

    // ── On-screen controls ──
    function showOsd(keepFocus) {
        if (destroyed || !errBox.classList.contains('hidden')) return;
        osd.classList.remove('hidden');
        if (!keepFocus && (!Nav.current() || !osd.contains(Nav.current()))) Nav.focus(playBtn);
        bumpHide();
    }
    function hideOsd() { osd.classList.add('hidden'); clearTimeout(hideTimer); }
    function osdVisible() { return !osd.classList.contains('hidden'); }
    function bumpHide() {
        clearTimeout(hideTimer);
        hideTimer = setTimeout(function () { if (!v.paused && App.top() && App.top().el === el) hideOsd(); }, 5000);
    }

    // ── Audio tracks (only what the TV browser exposes) ──
    function isFrTrack(t) {
        return /^(fr|fre|fra)\b/i.test(t.language || '') || /fran[cç]ais|french|\bVF[FQI]?\b/i.test(t.label || '');
    }
    function pickFrenchAudio() {
        var at = v.audioTracks;
        if (!prefs.preferFrench || frenchPicked || !at || at.length < 2) return;
        for (var i = 0; i < at.length; i++) {
            if (isFrTrack(at[i])) {
                frenchPicked = true;
                if (!at[i].enabled) { for (var j = 0; j < at.length; j++) at[j].enabled = (j === i); U.toast('Piste audio : français'); }
                return;
            }
        }
    }
    function audioMenu() {
        var at = v.audioTracks;
        var items = [];
        var note = null;
        if (at && at.length) {
            for (var i = 0; i < at.length; i++) (function (i) {
                var t = at[i];
                items.push({ label: t.label || Subs.langName(t.language) || 'Piste ' + (i + 1),
                    sub: t.language || '', selected: t.enabled,
                    action: function () { for (var j = 0; j < at.length; j++) at[j].enabled = (j === i); } });
            })(i);
            if (at.length === 1) note = 'La TV ne voit qu’une piste audio dans ce fichier.';
        } else {
            note = 'Le navigateur de la TV ne permet pas de changer la piste audio : il lit la piste par défaut du fichier.';
        }
        if (note) {
            note += ' Pour être sûr d’avoir le français, choisis une source marquée VF.';
            items.push({ label: 'Choisir une autre source', action: leave });
        }
        App.menu({ title: 'Audio', note: note, items: items });
    }

    // ── Subtitles (fetched from subtitle addons, drawn by the app) ──
    function loadSubsList() {
        var bh = stream.raw.behaviorHints || {};
        API.subtitles(meta.type, videoId, { filename: bh.filename, videoSize: bh.videoSize, videoHash: bh.videoHash })
            .then(function (list) {
                list.sort(function (a, b) { return Subs.isFrench(b.lang) - Subs.isFrench(a.lang); });
                subsList = list;
                if (prefs.subsDefault === 'fr') {
                    var fr = list.filter(function (s) { return Subs.isFrench(s.lang); })[0];
                    if (fr) chooseSub(fr, true);
                }
            });
    }
    function chooseSub(s, quiet) {
        subsChosen = s;
        cues = [];
        lastSubText = '';
        subsEl.textContent = '';
        if (!s) return;
        Subs.fetchText(s.url).then(function (txt) {
            if (subsChosen !== s) return;
            cues = Subs.parse(txt);
            if (!quiet) U.toast('Sous-titres : ' + Subs.langName(s.lang) + (cues.length ? '' : ' (vides)'));
        }, function () { U.toast('Impossible de charger ces sous-titres'); });
    }
    function drawSubs() {
        var txt = cues.length ? Subs.at(cues, v.currentTime) : '';
        if (txt !== lastSubText) { lastSubText = txt; subsEl.textContent = txt; }
    }
    function subsMenu() {
        if (subsList === null) { U.toast('Recherche des sous-titres…'); return; }
        var items = [{ label: 'Désactivés', selected: !subsChosen, action: function () { chooseSub(null); } }];
        var count = {};
        subsList.slice(0, 40).forEach(function (s) {
            var name = Subs.langName(s.lang);
            count[name] = (count[name] || 0) + 1;
            items.push({ label: name + ' ' + count[name], selected: subsChosen === s, action: function () { chooseSub(s); } });
        });
        App.menu({ title: 'Sous-titres', items: items, note: subsList.length ? null : 'Aucun sous-titre trouvé (addon OpenSubtitles installé ?).' });
    }

    // ── Errors / next source / next episode ──
    function showError(msg) {
        if (destroyed) return;
        spinner.classList.add('hidden');
        hideOsd();
        U.clear(errBox);
        var idx = opts.sources.indexOf(stream);
        var next = idx >= 0 ? opts.sources[idx + 1] : null;
        var btns = h('div.dialog-buttons', { 'data-group': '' },
            next ? h('button.btn.primary.f.autofocus', { text: 'Source suivante', onSelect: function () {
                App.pop();
                App.push(Views.player({ meta: meta, video: video, stream: next, startAt: v.currentTime || opts.startAt, sources: opts.sources }));
            } }) : null,
            h('button.btn.f' + (next ? '' : '.autofocus'), { text: 'Choisir une source', onSelect: leave }),
            h('button.btn.f', { text: 'Réessayer', onSelect: function () {
                errBox.classList.add('hidden');
                var t = v.currentTime;
                v.load();
                opts.startAt = t || opts.startAt;
                v.play().catch(function () {});
            } }));
        errBox.appendChild(h('div.dialog', null, h('h2', { text: 'Problème de lecture' }), h('p', { text: msg }), btns));
        errBox.classList.remove('hidden');
        Nav.focusFirst(errBox);
    }

    function nextVideo() {
        if (!video || !meta.videos) return null;
        var vids = meta.videos.filter(function (x) { return x.season > 0 || video.season === 0; }).sort(function (a, b) {
            return a.season - b.season || (a.episode || a.number) - (b.episode || b.number);
        });
        for (var i = 0; i < vids.length; i++) if (vids[i].id === video.id) return vids[i + 1] || null;
        return null;
    }

    function playNext() {
        save();
        var binge = stream.raw.behaviorHints && stream.raw.behaviorHints.bingeGroup;
        App.pop();                                     // player
        if (App.top() && App.top().name === 'streams') App.pop();
        App.push(Views.streams(meta, nextVid, 0, { binge: binge || null }));
    }

    var view = {
        name: 'player', el: el,
        onKey: function (k) {
            if (!errBox.classList.contains('hidden')) {
                if (k === 'back') { leave(); return true; }
                return false;
            }
            if (k === 'play') { v.play().catch(function () {}); return true; }
            if (k === 'pause') { v.pause(); return true; }
            if (k === 'playpause') { togglePlay(); return true; }
            if (k === 'stop') { leave(); return true; }
            if (k === 'ff') { seekBy(3); return true; }
            if (k === 'rw') { seekBy(-3); return true; }
            if (k === 'info' || k === 'red') { updateInfo(); showOsd(); return true; }
            if (!osdVisible()) {
                if (k === 'left' || k === 'right') { seekBy(k === 'left' ? -1 : 1); return true; }
                if (k === 'enter') { togglePlay(); showOsd(); return true; }
                if (k === 'up' || k === 'down') { showOsd(); return true; }
                if (k === 'back') { leave(); return true; }
                return false;
            }
            bumpHide();
            if (k === 'back') { hideOsd(); return true; }
            if ((k === 'left' || k === 'right') && Nav.current() === progress) { seekBy(k === 'left' ? -1 : 1); return true; }
            return false;
        },
        onShow: function () { if (v.paused && v.currentTime > 0) showOsd(); },
        onDestroy: function () {
            destroyed = true;
            [hideTimer, seekTimer, stallTimer].forEach(clearTimeout);
            [saveTimer, subsTimer].forEach(clearInterval);
            try { v.pause(); v.removeAttribute('src'); v.load(); } catch (e) {}
        }
    };
    setTimeout(start, 0);
    return view;
};
