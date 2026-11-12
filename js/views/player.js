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
    var progress = h('div.progress.f', { onSelect: function () { togglePlay(); } }, buf, fill, knob);
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
                h('button.btn.f', { text: 'Sources', onSelect: sourcesMenu }),
                nextVid ? h('button.btn.f', { text: 'Épisode suivant ▶', onSelect: playNext }) : null)));
    var errBox = h('div.player-error.hidden');
    var seekBadge = h('div.seek-badge.hidden');
    // "Passer l'intro" and the next-episode countdown float above the video;
    // with the controls hidden, OK triggers them and Back dismisses the countdown.
    var skipBtn = h('button.btn.primary.f', { onSelect: function () { if (skipAction) skipAction(); } });
    var skipBox = h('div.skip-box.hidden', null, skipBtn);
    var nextCount = h('div.next-count');
    var nextBox = h('div.next-box.hidden', null,
        h('div.muted.small', { text: 'Épisode suivant' }),
        h('div.next-title', { text: nextVid ? 'S' + nextVid.season + ' · É' + (nextVid.episode || nextVid.number) +
            (nextVid.title || nextVid.name ? '  ' + (nextVid.title || nextVid.name) : '') : '' }),
        nextCount,
        h('div.dialog-buttons', { 'data-group': '' },
            h('button.btn.primary.f', { text: 'Lire maintenant', onSelect: function () { stopCountdown(false); playNext(); } }),
            h('button.btn.f', { text: 'Annuler', onSelect: function () { stopCountdown(true); } })));
    var el = h('div.player', null, v, subsEl, spinner, seekBadge, skipBox, nextBox, osd, errBox);

    var hideTimer = null, saveTimer = null, subsTimer = null, stallTimer = null;
    var cues = [], subsList = null, subsChosen = null, lastSubText = '';
    var seekTarget = null, seekTimer = null, lastSeekKey = 0, seekStreak = 0;
    var destroyed = false, frenchPicked = false;
    var segs = null, skipAction = null, skipKind = null;
    var countdown = null, countLeft = 0, nextCancelled = false;
    var tracks = Lib.trackPref(meta.id);

    // ── Playback ──
    function start() {
        v.src = stream.raw.url;
        v.play().catch(function () {});
        saveTimer = setInterval(save, 20000);
        subsTimer = setInterval(drawSubs, 200);
        loadSubsList();
        loadSegments();
    }

    // ── Intro / recap / credits (community timings from SkipDB, by IMDb id) ──
    function loadSegments() {
        var m = /^(tt\d+)(?::(\d+):(\d+))?$/.exec(videoId);
        if (!m) return;
        U.fetchJson('https://api.skipdb.tv/api/segments?imdb_id=' + m[1] + (m[2] ? '&season=' + m[2] + '&episode=' + m[3] : ''), null, 8000)
            .then(function (r) { if (!destroyed && r && r.segments) segs = r.segments; }, function () {});
    }
    function seg(name) {
        var x = segs && segs[name];
        return x && x.end_ms > x.start_ms ? { start: x.start_ms / 1000, end: x.end_ms / 1000 } : null;
    }
    function jumpTo(t) { v.currentTime = t; hideSkip(); if (v.paused) v.play().catch(function () {}); }
    function showSkip(kind, label, action) {
        skipAction = action;
        if (skipKind === kind) return;
        skipKind = kind;
        skipBtn.textContent = label;
        skipBox.classList.remove('hidden');
    }
    function hideSkip() {
        if (!skipKind) return;
        skipKind = null; skipAction = null;
        skipBox.classList.add('hidden');
        if (Nav.current() === skipBtn) Nav.focus(osdVisible() ? playBtn : progress);
    }
    function startCountdown() {
        if (!nextVid || nextCancelled || countdown) return;
        countLeft = 10;
        nextCount.textContent = 'Lecture dans ' + countLeft + ' s';
        nextBox.classList.remove('hidden');
        countdown = setInterval(function () {
            if (v.paused) return;
            countLeft--;
            nextCount.textContent = 'Lecture dans ' + countLeft + ' s';
            if (countLeft <= 0) { stopCountdown(false); playNext(); }
        }, 1000);
    }
    function stopCountdown(cancel) {
        clearInterval(countdown);
        countdown = null;
        if (cancel) nextCancelled = true;
        nextBox.classList.add('hidden');
        if (nextBox.contains(Nav.current())) Nav.focus(osdVisible() ? playBtn : progress);
    }
    function checkSegments() {
        var d = v.duration, t = v.currentTime;
        if (!d || !isFinite(d) || seekTarget !== null || destroyed) return;
        var recap = seg('recap'), intro = seg('intro'), outro = seg('outro');
        if (recap && t >= recap.start && t < recap.end - 2) showSkip('recap', 'Passer le récap', function () { jumpTo(recap.end); });
        else if (intro && t >= intro.start && t < intro.end - 2) showSkip('intro', 'Passer l’intro', function () { jumpTo(intro.end); });
        else hideSkip();
        if (!nextVid) return;
        var creditsAt = outro && outro.start > d * 0.6 ? outro.start : d - 25;
        if (t >= creditsAt && t < d - 0.5) startCountdown();
        else if (countdown && t < creditsAt) stopCountdown(false);
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

    // Switch source without leaving the player: same ranking as the list,
    // playback resumes at the current position.
    function switchTo(s) {
        if (s === stream) return;
        save();
        var t = v.currentTime > 5 ? v.currentTime : opts.startAt;
        App.pop();
        App.push(Views.player({ meta: meta, video: video, stream: s, startAt: t, sources: opts.sources }));
    }

    // PC browsers decode the picture but not Dolby/DTS sound: the film plays
    // silent. Chrome/Edge expose decoded byte counters; no audio bytes while
    // video runs = no sound -> try the next source at the same position.
    var audioChecked = false;
    function checkAudio() {
        if (audioChecked || destroyed || Streams.isTV || v.paused) return;
        if (typeof v.webkitAudioDecodedByteCount !== 'number') { audioChecked = true; return; }
        if (v.webkitAudioDecodedByteCount > 0) { audioChecked = true; return; }
        if (!(v.webkitVideoDecodedByteCount > 0)) return;
        audioChecked = true;
        stream.compat = 'bad';
        if (stream.issues.indexOf('pas de son ici') === -1) stream.issues.push('pas de son ici');
        var next = opts.sources.filter(function (s) {
            return s !== stream && s.compat !== 'bad' && !Streams.isDead(s);
        })[0];
        if (!next) {
            U.toast('Pas de son : ce navigateur ne lit pas l’audio de cette source. Essaie une autre source ou la TV.');
            return;
        }
        U.toast('Pas de son sur ce navigateur : source suivante…');
        switchTo(next);
    }

    function sourceLabel(s) {
        var bits = [];
        if (s.cached === true) bits.push('⚡');
        if (s.res) bits.push(s.res);
        bits = bits.concat(Streams.langLabel(s));
        if (s.sizeBytes) bits.push(U.fmtSize(s.sizeBytes));
        if (s.compat === 'bad') bits.push('⚠ ' + s.issues.join(', '));
        return bits.join('  ·  ') || 'Source';
    }

    function sourcesMenu() {
        var list = opts.sources.filter(function (s) { return s === stream || !Streams.isDead(s); }).slice(0, 30);
        App.menu({
            title: 'Changer de source',
            note: list.length > 1 ? null : 'Pas d’autre source disponible pour ce titre.',
            items: list.map(function (s) {
                var t = Streams.title(s);
                return { label: sourceLabel(s), sub: t.length > 48 ? t.slice(0, 46) + '…' : t,
                    selected: s === stream, action: function () { switchTo(s); } };
            }).concat([{ label: 'Voir la liste complète', action: leave }])
        });
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
    v.addEventListener('timeupdate', checkSegments);
    v.addEventListener('progress', updateTime);
    v.addEventListener('playing', function () { setTimeout(checkAudio, 4000); spinner.classList.add('hidden'); clearTimeout(stallTimer); playBtn.textContent = '❚❚'; });
    v.addEventListener('pause', function () { if (destroyed) return; playBtn.textContent = '▶'; showOsd(); save(); });
    v.addEventListener('waiting', function () {
        spinner.classList.remove('hidden');
        clearTimeout(stallTimer);
        stallTimer = setTimeout(function () { showError('La vidéo ne charge plus (source lente ou bloquée).'); }, 40000);
    });
    v.addEventListener('ended', function () { save(); stopCountdown(false); if (nextVid && !nextCancelled) playNext(); else leave(); });
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
        // Seeking puts focus on the bar (←/→ keep seeking, OK plays/pauses).
        if (!Nav.current() || !osd.contains(Nav.current())) Nav.focus(keepFocus ? progress : playBtn);
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
        if (frenchPicked || !at || at.length < 2) return;
        if (tracks.audio) {
            for (var k = 0; k < at.length; k++) {
                if ((at[k].language || at[k].label) === tracks.audio) {
                    frenchPicked = true;
                    if (!at[k].enabled) for (var j2 = 0; j2 < at.length; j2++) at[j2].enabled = (j2 === k);
                    return;
                }
            }
        }
        if (!prefs.preferFrench) return;
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
                    action: function () {
                        for (var j = 0; j < at.length; j++) at[j].enabled = (j === i);
                        if (t.language || t.label) Lib.setTrackPref(meta.id, 'audio', t.language || t.label);
                    } });
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
                if (tracks.sub === 'off') return;
                if (tracks.sub) {
                    var same = list.filter(function (s) { return Subs.langName(s.lang) === tracks.sub; })[0];
                    if (same) { chooseSub(same, true); return; }
                }
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
        var items = [{ label: 'Désactivés', selected: !subsChosen, action: function () {
            Lib.setTrackPref(meta.id, 'sub', 'off');
            chooseSub(null);
        } }];
        var count = {};
        subsList.slice(0, 40).forEach(function (s) {
            var name = Subs.langName(s.lang);
            count[name] = (count[name] || 0) + 1;
            items.push({ label: name + ' ' + count[name], selected: subsChosen === s, action: function () {
                Lib.setTrackPref(meta.id, 'sub', name);
                chooseSub(s);
            } });
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
                if (k === 'enter' && countdown) { stopCountdown(false); playNext(); return true; }
                if (k === 'enter' && skipAction) { skipAction(); return true; }
                if (k === 'enter') { togglePlay(); showOsd(); return true; }
                if (k === 'back' && countdown) { stopCountdown(true); return true; }
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
            [saveTimer, subsTimer, countdown].forEach(clearInterval);
            try { v.pause(); v.removeAttribute('src'); v.load(); } catch (e) {}
        }
    };
    setTimeout(start, 0);
    return view;
};
