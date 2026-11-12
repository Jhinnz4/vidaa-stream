const { test, expect } = require('@playwright/test');
const { mock } = require('./fixtures');

const focused = (page) => page.evaluate(() => {
  const el = document.querySelector('.layer:last-child .focused');
  return el ? { cls: el.className, text: el.textContent.trim().slice(0, 60) } : null;
});
async function key(page, k, n = 1) { for (let i = 0; i < n; i++) { await page.keyboard.press(k); await page.waitForTimeout(60); } }
async function start(page) {
  await page.goto('/');
  await expect(page.locator('.profiles h1')).toHaveText('Qui regarde ?', { timeout: 10000 });
  await page.keyboard.press('Enter');
}
async function openSeries(page) {
  await start(page);
  await expect(page.locator('.row', { hasText: 'Populaires — Séries' })).toHaveCount(1);
  await page.evaluate(() => App.push(Views.detail('series', 'tt2000000')));
  await expect(page.locator('.detail h1')).toHaveText('La Série');
}
const fakeVideo = (page, duration) => page.evaluate((d) => {
  const v = document.querySelector('video'); let p = false, t = 0;
  Object.defineProperty(v, 'paused', { get: () => p });
  Object.defineProperty(v, 'duration', { get: () => d });
  Object.defineProperty(v, 'currentTime', { get: () => t, set: (x) => { t = x; } });
  v.play = () => { p = false; return Promise.resolve(); };
  v.pause = () => { p = true; };
  window.__at = (x) => { t = x; v.dispatchEvent(new Event('timeupdate')); };
}, duration);

test('player: skip intro with OK, next-episode countdown (Back cancels)', async ({ page }) => {
  await mock(page);
  await page.route('https://media.test/**', () => {});
  await openSeries(page);
  await key(page, 'ArrowDown');
  await key(page, 'Enter');                                       // episode 1x1, best source
  await expect(page.locator('.player')).toBeVisible();
  await fakeVideo(page, 1200);
  await page.waitForTimeout(300);
  await page.evaluate(() => window.__at(20));
  await expect(page.locator('.skip-box')).toBeVisible();
  await expect(page.locator('.skip-box')).toHaveText('Passer l’intro');
  await key(page, 'Enter');
  expect(await page.evaluate(() => document.querySelector('video').currentTime)).toBe(70);
  await expect(page.locator('.skip-box')).toBeHidden();
  await page.evaluate(() => window.__at(1180));                   // 20 s before the end
  await expect(page.locator('.next-box')).toBeVisible();
  await expect(page.locator('.next-box')).toContainText('S1 · É2');
  await key(page, 'Backspace');
  await expect(page.locator('.next-box')).toBeHidden();
  expect(await page.locator('.player').count()).toBe(1);
  await page.evaluate(() => window.__at(1185));
  await expect(page.locator('.next-box')).toBeHidden();           // cancelled stays cancelled
});

test('player: countdown OK plays the next episode now', async ({ page }) => {
  await mock(page);
  await page.route('https://media.test/**', () => {});
  await openSeries(page);
  await key(page, 'ArrowDown');
  await key(page, 'Enter');
  await expect(page.locator('.player')).toBeVisible();
  await fakeVideo(page, 1200);
  await page.evaluate(() => window.__at(1180));
  await expect(page.locator('.next-box')).toBeVisible();
  await key(page, 'Enter');
  await expect(page.locator('.page-head h2')).toContainText('S1 · É2');
});

test('player: subtitle language chosen by hand is reused for the same series', async ({ page }) => {
  await mock(page);
  await page.route('https://media.test/**', () => {});
  await openSeries(page);
  await page.evaluate(() => App.push(Views.player({ meta: { id: 'tt2000000', type: 'series', name: 'X', videos: [] },
    video: { id: 'tt2000000:1:1', season: 1, episode: 1 }, stream: { raw: { url: 'https://media.test/z.mp4' }, issues: [] }, startAt: 0, sources: [] })));
  await page.waitForTimeout(500);
  await key(page, 'ArrowUp');
  await key(page, 'ArrowRight', 2);
  expect((await focused(page)).text).toBe('Sous-titres');
  await key(page, 'Enter');
  await key(page, 'ArrowDown');
  await key(page, 'Enter');
  await expect(page.locator('.player-subs')).toHaveText('Bonjour tout le monde', { timeout: 5000 });
  await page.evaluate(() => { App.pop(); App.push(Views.player({ meta: { id: 'tt2000000', type: 'series', name: 'X', videos: [] },
    video: { id: 'tt2000000:1:2', season: 1, episode: 2 }, stream: { raw: { url: 'https://media.test/z.mp4' }, issues: [] }, startAt: 0, sources: [] })); });
  await expect(page.locator('.player-subs')).toHaveText('Bonjour tout le monde', { timeout: 5000 });
});

test('detail: mark episode / season watched, trailer, cast search, similar titles', async ({ page }) => {
  await mock(page);
  await openSeries(page);
  await expect(page.locator('.episode')).toHaveCount(3);
  await key(page, 'ArrowDown');
  await key(page, 'ArrowRight');
  expect((await focused(page)).text).toBe('Marquer vu');
  await key(page, 'Enter');
  await expect(page.locator('.ep-row').first().locator('.ep-seen')).toBeVisible();
  expect((await focused(page)).text).toBe('✓ Vu');
  await key(page, 'Enter');
  await expect(page.locator('.ep-row').first().locator('.ep-seen')).toHaveCount(0);
  await page.locator('.season-mark').evaluate((b) => b._onSelect(b));
  await expect(page.locator('.ep-seen')).toHaveCount(3);
  await expect(page.locator('.season-mark')).toHaveText('Saison non vue');
  await expect(page.locator('.detail-more .chip')).toHaveText(['Cléo Réal (réal.)', 'Ana Actrice', 'Bob Acteur']);
  const trailer = page.locator('.actions .btn', { hasText: 'Bande-annonce' });
  await expect(trailer).toHaveCount(1);
  await trailer.evaluate((b) => b._onSelect(b));
  await expect(page.locator('.trailer iframe')).toHaveAttribute('src', /youtube-nocookie\.com\/embed\/yt123/);
  await key(page, 'Backspace');
  await expect(page.locator('.trailer')).toHaveCount(0);
  await page.locator('.detail-more .chip').nth(1).evaluate((b) => b._onSelect(b));
  await expect(page.locator('.search-results .card').first()).toBeVisible();
  // Movies: same-genre titles from a catalog with a genre filter (itself excluded).
  await page.evaluate(() => App.push(Views.detail('movie', 'tt1000000')));
  const sim = page.locator('.layer:last-child .detail-more .row');
  await expect(sim.locator('h3')).toHaveText('Titres similaires');
  await expect(sim.locator('.card')).toHaveCount(19);
});

test('continue watching: "Retirer" hides it', async ({ page }) => {
  const item = { _id: 'tt1000000', name: 'Film 1', type: 'movie', removed: false, temp: false, _ctime: '2026-01-01T00:00:00.000Z', _mtime: '2026-01-01T00:00:00.000Z',
    state: { lastWatched: new Date().toISOString(), timeOffset: 600000, duration: 6000000, video_id: 'tt1000000' } };
  await mock(page, { library: [item] });
  await start(page);
  await expect(page.locator('.row h3').first()).toHaveText('Continuer à regarder');
  await key(page, 'Enter');
  await expect(page.locator('.detail h1')).toHaveText('Le Film');
  const b = page.locator('.actions .btn', { hasText: 'Retirer' });
  await b.evaluate((x) => x._onSelect(x));
  await expect(b).toHaveCount(0);
  await key(page, 'Backspace');
  await expect(page.locator('.row h3', { hasText: 'Continuer' })).toHaveCount(0);
});

test('home: new episodes row; rows can be hidden and reordered', async ({ page }) => {
  const item = { _id: 'tt2000000', name: 'Série 1', type: 'series', removed: false, temp: false, _ctime: '2026-01-01T00:00:00.000Z', _mtime: '2026-01-01T00:00:00.000Z',
    state: { lastWatched: null, timeOffset: 0, video_id: null } };
  await mock(page, { library: [item] });
  await start(page);
  const newRow = page.locator('.row', { hasText: 'Nouveaux épisodes' });
  await expect(newRow).toHaveCount(1);
  await expect(newRow.locator('.card-badge')).toHaveText('Nouveau');
  await expect(newRow.locator('.card-sub')).toHaveText('S2 · É3');
  await page.evaluate(() => App.push(Views.homeEdit()));
  await expect(page.locator('.home-edit-row')).toHaveCount(2);
  expect((await focused(page)).text).toContain('Populaires — Films');
  await key(page, 'Enter');
  await expect(page.locator('.home-edit-row').first()).toHaveClass(/off/);
  await key(page, 'ArrowDown');
  await key(page, 'ArrowRight');
  expect((await focused(page)).text).toBe('↑');
  await key(page, 'Enter');
  await expect(page.locator('.home-edit-row').first()).toContainText('Séries');
  await key(page, 'Backspace');                                   // back on home: rebuilt
  await expect(page.locator('.row h3')).toHaveText(['Ma liste', 'Nouveaux épisodes', 'Populaires — Séries']);
});
