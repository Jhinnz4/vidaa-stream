const { test, expect } = require('@playwright/test');
const { mock } = require('./fixtures');

test.describe('phone (touch)', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('tap through profiles → home → detail → back button; bottom tab bar; no focus ring', async ({ page }) => {
    await mock(page);
    await page.goto('/');
    await expect(page.locator('.profiles h1')).toHaveText('Qui regarde ?', { timeout: 10000 });
    await page.locator('.profile-tile').first().tap();
    await expect(page.locator('.row', { hasText: 'Populaires — Séries' })).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.className)).toMatch(/touch/);
    expect(await page.evaluate(() => document.documentElement.className)).toMatch(/portrait/);
    // Bottom bar: the menu sits under the content.
    const bar = await page.locator('.sidebar').boundingBox();
    expect(bar.y).toBeGreaterThan(700);
    expect(bar.width).toBeGreaterThan(380);
    expect(await page.locator('.focused').count()).toBe(0);
    // Rows scroll natively.
    const items = page.locator('.row-items').first();
    expect(await items.evaluate((e) => getComputedStyle(e).overflowX)).toBe('auto');
    await page.locator('.row .card').first().tap();
    await expect(page.locator('.detail h1')).toBeVisible();
    await expect(page.locator('.fab-back')).toBeVisible();
    await page.locator('.fab-back').tap();
    await expect(page.locator('.detail')).toHaveCount(0);
    await expect(page.locator('.fab-back')).toBeHidden();
  });

  test('search uses a real text field', async ({ page }) => {
    await mock(page);
    await page.goto('/');
    await page.locator('.profile-tile').first().tap();
    await expect(page.locator('.row').first()).toBeVisible();
    await page.locator('.side-item').nth(1).tap();                 // Recherche
    const input = page.locator('.kb-input');
    await expect(input).toBeVisible();
    await expect(page.locator('.kb-grid')).toBeHidden();
    await input.fill('film');
    await expect(page.locator('.search-results .card').first()).toBeVisible({ timeout: 5000 });
  });

  test('player: tap shows controls, the bar seeks where tapped, ✕ closes', async ({ page }) => {
    await mock(page);
    await page.route('https://media.test/**', () => {});
    await page.goto('/');
    await page.locator('.profile-tile').first().tap();
    await expect(page.locator('.row').first()).toBeVisible();
    await page.evaluate(() => App.push(Views.player({ meta: { id: 'tt1000000', type: 'movie', name: 'X' }, video: null,
      stream: { raw: { url: 'https://media.test/z.mp4' }, issues: [] }, startAt: 0, sources: [] })));
    await page.evaluate(() => {
      const v = document.querySelector('video'); let t = 0;
      Object.defineProperty(v, 'duration', { get: () => 1000 });
      Object.defineProperty(v, 'currentTime', { get: () => t, set: (x) => { t = x; } });
    });
    await expect(page.locator('.osd')).toBeHidden();
    await page.touchscreen.tap(195, 420);
    await expect(page.locator('.osd')).toBeVisible();
    await expect(page.locator('.big-play')).toBeVisible();
    const bar = await page.locator('.progress').boundingBox();
    await page.touchscreen.tap(bar.x + bar.width * 0.5, bar.y + bar.height / 2);
    expect(await page.evaluate(() => Math.round(document.querySelector('video').currentTime))).toBe(500);
    await page.locator('.big-jump').last().tap();
    expect(await page.evaluate(() => Math.round(document.querySelector('video').currentTime))).toBe(510);
    await page.locator('.osd-right .btn', { hasText: '✕' }).tap();
    await expect(page.locator('.player')).toHaveCount(0);
  });
});

test.describe('PC (mouse)', () => {
  test('hover focuses, click opens, row arrows scroll, keyboard brings the ring back', async ({ page }) => {
    await mock(page);
    await page.goto('/');
    await expect(page.locator('.profiles h1')).toHaveText('Qui regarde ?', { timeout: 10000 });
    await page.mouse.move(10, 10);
    await page.mouse.move(60, 60, { steps: 5 });
    await page.locator('.profile-tile').first().click();
    const row = page.locator('.row', { hasText: 'Populaires — Films' });
    await expect(row).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.className)).toMatch(/mouse/);
    await row.locator('.card').nth(2).hover();
    await expect(row.locator('.card').nth(2)).toHaveClass(/focused/);
    const items = row.locator('.row-items');
    await row.locator('.row-arrow.next').click();
    await expect.poll(() => items.evaluate((e) => e.scrollLeft)).toBeGreaterThan(100);
    await row.locator('.card').nth(4).click();
    await expect(page.locator('.detail h1')).toHaveText('Le Film');
    await page.locator('.fab-back').click();
    await expect(page.locator('.detail')).toHaveCount(0);
    await page.keyboard.press('ArrowDown');
    expect(await page.evaluate(() => document.documentElement.className)).not.toMatch(/mouse/);
    await expect(page.locator('.focused')).toHaveCount(1);
  });
});
