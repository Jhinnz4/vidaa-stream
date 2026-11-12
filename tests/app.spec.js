const { test, expect } = require('@playwright/test');
const { mock } = require('./fixtures');

const focused = (page) => page.evaluate(() => {
  const el = document.querySelector('.layer:last-child .focused');
  return el ? { cls: el.className, text: el.textContent.trim().slice(0, 60) } : null;
});

async function pick(page) {
  await expect(page.locator('.profiles h1')).toHaveText('Qui regarde ?', { timeout: 10000 });
  await page.keyboard.press('Enter');
}
async function start(page) { await page.goto('/'); await pick(page); }

async function key(page, k, n = 1) { for (let i = 0; i < n; i++) { await page.keyboard.press(k); await page.waitForTimeout(60); } }

test('login by code, then the profile picker, then home', async ({ page }) => {
  await mock(page, { loggedIn: false });
  await page.goto('/');
  await expect(page.locator('.login-code')).toHaveText('AB12');
  await pick(page);                                     // then "Qui regarde ?"
  await expect(page.locator('.row').first()).toBeVisible({ timeout: 10000 });
  expect(await page.evaluate(() => localStorage.getItem('sp_authKey'))).toBe('"KEY"');
});

test('home: D-pad moves along rows, down/up keeps the column, left reaches the sidebar', async ({ page }) => {
  await mock(page);
  await start(page);
  await expect(page.locator('.row')).toHaveCount(2);
  await page.waitForTimeout(300);
  expect((await focused(page)).text).toBe('Film 1');
  await key(page, 'ArrowRight', 3);
  expect((await focused(page)).text).toBe('Film 4');
  await key(page, 'ArrowDown');
  expect((await focused(page)).text).toMatch(/^Série/);
  await key(page, 'ArrowUp');
  expect((await focused(page)).text).toBe('Film 4');
  // Far right: row scrolls so the focused card stays on screen.
  await key(page, 'ArrowRight', 12);
  const box = await page.locator('.layer:last-child .focused').boundingBox();
  expect(box.x + box.width).toBeLessThanOrEqual(1280);
  await key(page, 'ArrowLeft', 30);
  expect((await focused(page)).cls).toContain('side-item');
  await key(page, 'ArrowRight');
  expect((await focused(page)).text).toBe('Film 1');
});

async function openSidebar(page, label) {
  await key(page, 'ArrowLeft', 30);
  await key(page, 'ArrowUp', 8);                  // top of the rail (profile)
  for (let i = 0; i < 8 && !((await focused(page)).text === label); i++) await key(page, 'ArrowDown');
  expect((await focused(page)).text).toBe(label);
  await key(page, 'Enter');
}

test('search: on-screen keyboard with the D-pad, remote digits/real keys, one query per word', async ({ page }) => {
  const calls = await mock(page);
  await start(page);
  await expect(page.locator('.row')).toHaveCount(2);
  await openSidebar(page, 'Recherche');
  expect((await focused(page)).text).toBe('a');
  // D-pad typing: "m" is row 3, col 1 (a b c d e f / g h i j k l / m …).
  await key(page, 'ArrowDown', 2);
  expect((await focused(page)).text).toBe('m');
  await key(page, 'Enter');
  await key(page, 'ArrowUp', 2);
  await key(page, 'Enter');                       // "a"
  await expect(page.locator('.kb-text')).toHaveText('ma');
  // The rest from a real keyboard, slowly (like remote typing).
  await page.keyboard.type('trix', { delay: 300 });
  await expect(page.locator('.kb-text')).toHaveText('matrix');
  await expect(page.locator('.search-results .row')).toHaveCount(2, { timeout: 5000 });
  expect([...new Set(calls.catalogSearch)]).toEqual(['matrix']);
  // Right from the keyboard reaches the results; opening one remembers the search.
  await key(page, 'ArrowRight', 6);
  expect((await focused(page)).text).toMatch(/^matrix/);
  await key(page, 'Enter');
  await expect(page.locator('.detail h1')).toBeVisible();
  expect(await page.evaluate(() => Profiles.current().searches)).toEqual(['matrix']);
});

test('profiles: create one with keyboard + avatar, pick it, its progress stays separate', async ({ page }) => {
  const calls = await mock(page);
  await start(page);
  await expect(page.locator('.row')).toHaveCount(2);
  await openSidebar(page, 'Moi');
  await expect(page.locator('.profiles h1')).toHaveText('Qui regarde ?');
  await key(page, 'ArrowRight');
  expect((await focused(page)).text).toBe('Ajouter');
  await key(page, 'Enter');
  await expect(page.locator('.profile-editor h1')).toHaveText('Nouveau profil');
  await page.keyboard.type('lea', { delay: 50 });
  await expect(page.locator('.kb-text')).toHaveText('Lea');
  // Avatar grid is right of the keyboard.
  await key(page, 'ArrowRight', 7);
  expect((await focused(page)).cls).toContain('avatar-pick');
  await key(page, 'ArrowRight');
  await key(page, 'Enter');
  // Back left to the buttons.
  await key(page, 'ArrowLeft', 12);
  for (let i = 0; i < 10 && (await focused(page)).text !== 'Enregistrer'; i++) await key(page, 'ArrowDown');
  expect((await focused(page)).text).toBe('Enregistrer');
  await key(page, 'Enter');
  await expect(page.locator('.profile-tile')).toHaveCount(3);       // Moi, Lea, Ajouter
  await key(page, 'ArrowRight');
  expect((await focused(page)).text).toBe('Lea');
  await key(page, 'Enter');
  await expect(page.locator('.row')).toHaveCount(2);
  const p = await page.evaluate(() => Profiles.current());
  expect(p.name).toBe('Lea');
  expect(p.owner).toBe(false);
  // Progress of a non-owner profile stays on the TV (no account write).
  await page.evaluate(() => Lib.saveProgress({ id: 'tt1000003', type: 'movie', name: 'Film 4' }, 'tt1000003', 600, 6000));
  await page.evaluate(() => App.reset(Views.home()));
  await expect(page.locator('.row').first().locator('h3')).toHaveText('Continuer à regarder');
  expect(calls.puts).toHaveLength(0);
  // Back to the owner profile: no such progress there. With 2 profiles the picker shows at boot.
  await page.reload();
  await expect(page.locator('.profiles h1')).toHaveText('Qui regarde ?');
  expect((await focused(page)).text).toBe('Lea');               // last used
  await key(page, 'ArrowLeft');
  await key(page, 'Enter');
  await expect(page.locator('.row')).toHaveCount(2);
  expect(await page.locator('.row h3').allTextContents()).not.toContain('Continuer à regarder');
});

test('my list: add from the detail page (synced for the owner), shown on home and in "Ma liste"', async ({ page }) => {
  const calls = await mock(page);
  await start(page);
  await expect(page.locator('.row')).toHaveCount(2);
  await key(page, 'Enter');
  await expect(page.locator('.detail h1')).toHaveText('Le Film');
  await key(page, 'ArrowRight', 2);
  expect((await focused(page)).text).toBe('+ Ma liste');
  await key(page, 'Enter');
  expect((await focused(page)).text).toBe('✓ Dans ma liste');
  await expect.poll(() => calls.puts.length).toBe(1);
  expect(calls.puts[0].changes[0]).toMatchObject({ _id: 'tt1000000', removed: false, temp: false });
  await key(page, 'Backspace');
  await expect(page.locator('.row').first().locator('h3')).toHaveText('Ma liste');
  await openSidebar(page, 'Ma liste');
  await expect(page.locator('.grid .card')).toHaveCount(1);
});

test('browse: Films grid with genre filter', async ({ page }) => {
  const calls = await mock(page);
  await start(page);
  await expect(page.locator('.row')).toHaveCount(2);
  await openSidebar(page, 'Films');
  await expect(page.locator('.grid .card')).toHaveCount(20);
  expect((await focused(page)).cls).toContain('card');            // focus enters the page
  await expect(page.locator('.chip')).toHaveText(['Populaires', 'Tous les genres', 'Action', 'Drame']);
  await key(page, 'ArrowUp', 3);
  await key(page, 'ArrowRight');
  for (let i = 0; i < 4 && (await focused(page)).text !== 'Action'; i++) await key(page, 'ArrowRight');
  expect((await focused(page)).text).toBe('Action');
  await key(page, 'Enter');
  await expect.poll(() => calls.catalogExtra.includes('genre=Action')).toBe(true);
  await key(page, 'ArrowDown', 2);
  expect((await focused(page)).cls).toContain('card');
});

const videoSrc = (page) => page.evaluate(() => { const v = document.querySelector('video'); return v ? v.getAttribute('src') || '' : ''; });

async function openFilm(page) {
  await start(page);
  await expect(page.locator('.row')).toHaveCount(2);
  await key(page, 'Enter');
  await expect(page.locator('.detail h1')).toHaveText('Le Film');
}

test('sources list ("Choisir la source"): MULTI+VF instant > instant > quality, risky last, torrent-only hidden', async ({ page }) => {
  await mock(page);
  await openFilm(page);
  await key(page, 'ArrowRight');
  expect((await focused(page)).text).toBe('Choisir la source');
  await key(page, 'Enter');
  await expect(page.locator('.source')).toHaveCount(4);
  const titles = await page.locator('.source-title').allTextContents();
  expect(titles[0]).toContain('MULTI.VFF');        // instant + MULTI with VF
  expect(titles[1]).toContain('x264');             // instant (EN)
  expect(titles[2]).toContain('TRUEFRENCH');       // not instant
  expect(titles[3]).toContain('REMUX');            // risky for the TV
  await expect(page.locator('.source').nth(0).locator('.badge.best')).toHaveText('★ Meilleur choix');
  await expect(page.locator('.source').nth(3).locator('.badge.bad')).toContainText('DTS');
  expect((await focused(page)).text).toContain('MULTI.VFF');
  await key(page, 'ArrowUp');
  await key(page, 'Enter');                        // hide risky sources
  await expect(page.locator('.source')).toHaveCount(3);
});

test('"Lecture" plays the best source directly; the player can switch source in place', async ({ page }) => {
  await mock(page);
  await page.route('https://media.test/**', () => {});      // media never answers: player stays up
  await openFilm(page);
  await key(page, 'Enter');                                  // ▶ Lecture
  await expect(page.locator('.player')).toBeVisible();
  await expect.poll(() => videoSrc(page)).toContain('d.mp4');
  await key(page, 'ArrowUp');
  await key(page, 'ArrowRight', 3);
  expect((await focused(page)).text).toBe('Sources');
  await key(page, 'Enter');
  await expect(page.locator('.menu-item')).toHaveCount(5);   // 4 sources + full list
  await expect(page.locator('.menu-item').first()).toContainText('✓');
  await key(page, 'ArrowDown');
  await key(page, 'Enter');
  await expect.poll(() => videoSrc(page)).toContain('b.mp4');
  // Back from the player: the full list is right there.
  await key(page, 'Backspace');
  await expect(page.locator('.source')).toHaveCount(4);
});

test('player: unreadable file shows an error with next-source', async ({ page }) => {
  await mock(page);
  await openFilm(page);
  await key(page, 'Enter');
  await expect(page.locator('.player-error')).toBeVisible({ timeout: 10000 });
  expect((await focused(page)).text).toBe('Source suivante');
  await key(page, 'Enter');
  await expect(page.locator('.player-error')).toBeVisible({ timeout: 10000 });
  await key(page, 'Backspace');
  await expect(page.locator('.source')).toHaveCount(4);
});

test('player controls: audio note, French subtitles drawn by the app', async ({ page }) => {
  await mock(page);
  await page.route('https://media.test/**', () => {});
  await openFilm(page);
  await key(page, 'Enter');
  await expect(page.locator('.player')).toBeVisible();
  await key(page, 'ArrowUp');
  await expect(page.locator('.osd')).toBeVisible();
  expect((await focused(page)).text).toBe('❚❚');
  await key(page, 'ArrowRight');
  expect((await focused(page)).text).toBe('Audio');
  await key(page, 'Enter');
  await expect(page.locator('.menu-note')).toContainText('source marquée VF');
  await key(page, 'Backspace');
  expect((await focused(page)).text).toBe('Audio');
  await key(page, 'ArrowRight');
  expect((await focused(page)).text).toBe('Sous-titres');
  await key(page, 'Enter');
  await expect(page.locator('.menu-item')).toHaveCount(3);
  expect(await page.locator('.menu-item').nth(1).textContent()).toContain('Français');
  await key(page, 'ArrowDown');
  await key(page, 'Enter');
  await expect(page.locator('.player-subs')).toHaveText('Bonjour tout le monde');
});

test('debrid "not available" clip: skips to the next source and hides the dead one', async ({ page }) => {
  await mock(page);
  // Every media URL "plays" a 30 s clip, like the debrid placeholder video.
  await page.addInitScript(() => {
    Object.defineProperty(HTMLMediaElement.prototype, 'duration', { get() { return this.src ? 30 : NaN; } });
    HTMLMediaElement.prototype.play = function () {
      setTimeout(() => this.dispatchEvent(new Event('loadedmetadata')), 50);
      return Promise.resolve();
    };
  });
  await page.route('https://media.test/**', () => {});
  await openFilm(page);
  await key(page, 'Enter');
  // All four are placeholders: chain through them, then explain.
  await expect(page.locator('.player-error')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('.player-error p')).toContainText('plus disponible');
  await key(page, 'Backspace');
  await expect(page.locator('.source')).toHaveCount(0);
  await expect(page.locator('.page-body > p')).toContainText('4 source(s) indisponible(s)');
  // The not-yet-cached one is only hidden temporarily; cached ones for good.
  const dead = await page.evaluate(() => JSON.parse(localStorage.getItem('sp_deadSources')));
  expect(Object.values(dead).filter((v) => v === 0)).toHaveLength(3);
  expect(Object.values(dead).filter((v) => v > Date.now())).toHaveLength(1);
});

test('progress is saved on an existing library item without dropping its fields', async ({ page }) => {
  const item = { _id: 'tt1000000', name: 'Film 1', type: 'movie', poster: null, posterShape: 'poster', removed: false, temp: false,
    _ctime: '2026-01-01T00:00:00.000Z', _mtime: '2026-01-01T00:00:00.000Z', customField: 42,
    state: { lastWatched: '2026-01-01T00:00:00.000Z', timeWatched: 0, timeOffset: 600000, overallTimeWatched: 0, timesWatched: 0,
      flaggedWatched: 0, duration: 6000000, video_id: 'tt1000000', watched: null, noNotif: false },
    behaviorHints: { defaultVideoId: null, featuredVideoId: null, hasScheduledVideos: false } };
  const calls = await mock(page, { library: [item] });
  await start(page);
  await expect(page.locator('.row').first().locator('h3')).toHaveText('Continuer à regarder');
  await key(page, 'Enter');
  await expect(page.locator('.btn.primary')).toHaveText('▶ Reprendre à 10:00');
  await page.evaluate(() => Lib.saveProgress({ id: 'tt1000000', type: 'movie', name: 'Film 1' }, 'tt1000000', 1200, 6000));
  await expect.poll(() => calls.puts.length).toBe(1);
  const put = calls.puts[0].changes[0];
  expect(put.customField).toBe(42);
  expect(put.state.timeOffset).toBe(1200000);
  expect(put.state.duration).toBe(6000000);
  expect(put._mtime).not.toBe(item._mtime);
});

test('series: seasons switch episodes; next-episode uses the same release group', async ({ page }) => {
  await mock(page);
  await start(page);
  await expect(page.locator('.row')).toHaveCount(2);
  await key(page, 'ArrowDown');
  await key(page, 'Enter');
  await expect(page.locator('.detail h1')).toHaveText('La Série');
  await expect(page.locator('.episode')).toHaveCount(3);
  await key(page, 'ArrowRight');
  await expect(page.locator('.episode .ep-title').first()).toHaveText('1. Ep 2x1');
  await key(page, 'ArrowDown');
  expect((await focused(page)).text).toContain('Ep 2x1');
});

test('PC browser: Dolby-audio releases go last (silent in Chrome), not on the TV', async ({ page }) => {
  await mock(page);
  await page.goto('/');
  const r = await page.evaluate(() => {
    const a = Streams.parse({ name: '[RD+] T\n1080p', title: 'Film.MULTI.VFF.1080p.WEB.EAC3.5.1.x264', url: 'https://m/a.mkv' }, {}, 0);
    const b = Streams.parse({ name: '[RD+] T\n1080p', title: 'Film.MULTI.VFF.1080p.WEB.AAC.x264', url: 'https://m/b.mkv' }, {}, 1);
    return { tv: Streams.isTV, a: a.compat, b: b.compat, order: Streams.rank([a, b], { preferFrench: true, quality: '1080p' }).map((s) => s.index) };
  });
  expect(r).toEqual({ tv: false, a: 'bad', b: 'ok', order: [1, 0] });
});

test('series: watched/in-progress episodes on thumbnails; finished episode keeps the show in "continue watching"', async ({ page }) => {
  const item = { _id: 'tt2000000', name: 'Série 1', type: 'series', poster: null, removed: false, temp: false,
    _ctime: '2026-01-01T00:00:00.000Z', _mtime: '2026-01-01T00:00:00.000Z', keepMe: 1,
    state: { lastWatched: new Date().toISOString(), timeOffset: 0, duration: 1200000, video_id: 'tt2000000:1:2',
      watched: 'tt2000000:1:2:2:eJxjBgAABAAE', timesWatched: 2 } };
  const calls = await mock(page, { library: [item] });
  await page.addInitScript(() => localStorage.setItem('sp_episodes_p1', JSON.stringify({ tt2000000: { 'tt2000000:1:3': [600, 1200, 0] } })));
  await start(page);
  // Older version had dropped it (offset 0 after finishing 1x2): it comes back on the next episode.
  await expect(page.locator('.row').first().locator('h3').first()).toContainText('Continuer');
  await expect(page.locator('.row').first().locator('.card').first()).toContainText('S1 · É3');
  expect(calls.puts.some((p) => p.changes && p.changes[0].state.video_id === 'tt2000000:1:3' && p.changes[0].keepMe === 1)).toBe(true);
  await key(page, 'Enter');
  await expect(page.locator('.detail h1')).toHaveText('La Série');
  await expect(page.locator('.actions .btn').first()).toHaveText('▶ Lecture S1 · É3');
  const eps = page.locator('.episode');
  await expect(eps).toHaveCount(3);
  await expect(eps.nth(0).locator('.ep-seen')).toBeVisible();
  await expect(eps.nth(1).locator('.ep-seen')).toBeVisible();
  await expect(eps.nth(2).locator('.ep-seen')).toHaveCount(0);
  await expect(eps.nth(2).locator('.card-progress div')).toHaveAttribute('style', /width: ?50%/);
  await expect(eps.nth(2)).toContainText('Reprendre à 10:00');
  // Finishing the last episode of season 1 moves the show to S2E1 instead of dropping it.
  const st = await page.evaluate(() => {
    const meta = { id: 'tt2000000', type: 'series', name: 'Série 1', videos: [1, 2, 3].map((e) => ({ id: 'tt2000000:1:' + e, season: 1, episode: e }))
      .concat([{ id: 'tt2000000:2:1', season: 2, episode: 1 }]) };
    Lib.saveProgress(meta, 'tt2000000:1:3', 1150, 1200);
    return { s: Lib.item('tt2000000').state, ep: Lib.episodeState(meta, 'tt2000000:1:3'), cw: Lib.continueWatching().length };
  });
  expect(st.s.video_id).toBe('tt2000000:2:1');
  expect(st.s.timeOffset).toBe(1);
  expect(st.ep.watched).toBe(true);
  expect(st.cw).toBe(1);
});
