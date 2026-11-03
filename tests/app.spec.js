const { test, expect } = require('@playwright/test');
const { mock } = require('./fixtures');

const focused = (page) => page.evaluate(() => {
  const el = document.querySelector('.layer:last-child .focused');
  return el ? { cls: el.className, text: el.textContent.trim().slice(0, 60) } : null;
});

async function key(page, k, n = 1) { for (let i = 0; i < n; i++) { await page.keyboard.press(k); await page.waitForTimeout(60); } }

test('login by code then lands on home', async ({ page }) => {
  await mock(page, { loggedIn: false });
  await page.goto('/');
  await expect(page.locator('.login-code')).toHaveText('AB12');
  await expect(page.locator('.row').first()).toBeVisible({ timeout: 10000 });
  expect(await page.evaluate(() => localStorage.getItem('sp_authKey'))).toBe('"KEY"');
});

test('home: D-pad moves along rows, down/up keeps the column, left reaches the sidebar', async ({ page }) => {
  await mock(page);
  await page.goto('/');
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

test('search: slow typing keeps the input focused and queries once', async ({ page }) => {
  const calls = await mock(page);
  await page.goto('/');
  await expect(page.locator('.row')).toHaveCount(2);
  await key(page, 'ArrowLeft', 2);
  await key(page, 'ArrowDown');
  expect((await focused(page)).text).toBe('Recherche');
  await key(page, 'Enter');
  const input = page.locator('.search-input');
  await key(page, 'Enter');                       // OK on the field opens the keyboard
  await page.keyboard.type('matrix', { delay: 400 });
  expect(await page.evaluate(() => document.activeElement.className)).toContain('search-input');
  await expect(page.locator('.search-results .row')).toHaveCount(3, { timeout: 5000 });
  expect(await page.evaluate(() => document.activeElement.className)).toContain('search-input');
  expect([...new Set(calls.catalogSearch)]).toEqual(['matrix']);
  await key(page, 'ArrowDown');
  expect((await focused(page)).text).toMatch(/^matrix/);
});

test('sources: French first, risky last and flagged, torrent-only hidden', async ({ page }) => {
  await mock(page);
  await page.goto('/');
  await expect(page.locator('.row')).toHaveCount(2);
  await key(page, 'Enter');
  await expect(page.locator('.detail h1')).toHaveText('Le Film');
  await key(page, 'Enter');
  await expect(page.locator('.source')).toHaveCount(3);
  const titles = await page.locator('.source-title').allTextContents();
  expect(titles[0]).toContain('TRUEFRENCH');
  expect(titles[1]).toContain('x264');
  expect(titles[2]).toContain('REMUX');
  await expect(page.locator('.source').nth(2).locator('.badge.bad')).toContainText('DTS');
  await expect(page.locator('.source').nth(0).locator('.badge.fr')).toHaveText('VF');
  expect((await focused(page)).text).toContain('TRUEFRENCH');
  // Hide risky sources.
  await key(page, 'ArrowUp');
  await key(page, 'Enter');
  await expect(page.locator('.source')).toHaveCount(2);
});

test('player: unreadable file shows an error with next-source; audio menu explains the limit', async ({ page }) => {
  await mock(page);
  await page.goto('/');
  await expect(page.locator('.row')).toHaveCount(2);
  await key(page, 'Enter');
  await expect(page.locator('.detail h1')).toHaveText('Le Film');
  await key(page, 'Enter');
  await expect(page.locator('.source')).toHaveCount(3);
  await key(page, 'Enter');
  await expect(page.locator('.player-error')).toBeVisible({ timeout: 10000 });
  expect((await focused(page)).text).toBe('Source suivante');
  await key(page, 'Enter');
  await expect(page.locator('.player-error')).toBeVisible({ timeout: 10000 });
  // Back from the error returns to the source list.
  await key(page, 'Backspace');
  await expect(page.locator('.source')).toHaveCount(3);
});

test('player controls: audio note, French subtitles drawn by the app', async ({ page }) => {
  await mock(page);
  await page.goto('/');
  await expect(page.locator('.row')).toHaveCount(2);
  await key(page, 'Enter');
  await key(page, 'Enter');
  await expect(page.locator('.source')).toHaveCount(3);
  // Media never answers, so the player stays up and the controls can be exercised.
  await page.route('https://media.test/**', () => {});      // never answers: stays loading
  await key(page, 'Enter');
  await expect(page.locator('.player')).toBeVisible();
  await key(page, 'ArrowUp');
  await expect(page.locator('.osd')).toBeVisible();
  expect((await focused(page)).text).toBe('❚❚');
  await key(page, 'ArrowRight');
  expect((await focused(page)).text).toBe('Audio');
  await key(page, 'Enter');
  await expect(page.locator('.menu-note')).toContainText('source marquée VF');
  await key(page, 'Backspace');                    // closes the menu, focus back on "Audio"
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

test('progress is saved on an existing library item without dropping its fields', async ({ page }) => {
  const item = { _id: 'tt1000000', name: 'Film 1', type: 'movie', poster: null, posterShape: 'poster', removed: false, temp: false,
    _ctime: '2026-01-01T00:00:00.000Z', _mtime: '2026-01-01T00:00:00.000Z', customField: 42,
    state: { lastWatched: '2026-01-01T00:00:00.000Z', timeWatched: 0, timeOffset: 600000, overallTimeWatched: 0, timesWatched: 0,
      flaggedWatched: 0, duration: 6000000, video_id: 'tt1000000', watched: null, noNotif: false },
    behaviorHints: { defaultVideoId: null, featuredVideoId: null, hasScheduledVideos: false } };
  const calls = await mock(page, { library: [item] });
  await page.goto('/');
  await expect(page.locator('.row').first().locator('h3')).toHaveText('Continuer à regarder');
  await key(page, 'Enter');
  await expect(page.locator('.btn.primary')).toHaveText('▶ Reprendre à 10:00');
  await page.evaluate(() => API.saveProgress({ id: 'tt1000000', type: 'movie', name: 'Film 1' }, 'tt1000000', 1200, 6000));
  await expect.poll(() => calls.puts.length).toBe(1);
  const put = calls.puts[0].changes[0];
  expect(put.customField).toBe(42);
  expect(put.state.timeOffset).toBe(1200000);
  expect(put.state.duration).toBe(6000000);
  expect(put._mtime).not.toBe(item._mtime);
});

test('series: seasons switch episodes; next-episode uses the same release group', async ({ page }) => {
  await mock(page);
  await page.goto('/');
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
