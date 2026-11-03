// Visual check only (not part of the default run): SHOTS=1 npx playwright test shots
const { test } = require('@playwright/test');
const { mock } = require('./fixtures');
const dir = process.env.SHOTS_DIR || 'test-results/shots';
test.skip(!process.env.SHOTS, 'screenshots only on demand');
test.use({ viewport: { width: 1920, height: 1080 } });
const k = async (p, key, n = 1) => { for (let i = 0; i < n; i++) { await p.keyboard.press(key); await p.waitForTimeout(80); } };
test('screens', async ({ page }) => {
  await mock(page);
  await page.goto('/');
  await page.waitForSelector('.row');
  await page.waitForTimeout(600);
  await k(page, 'ArrowRight', 2);
  await page.screenshot({ path: dir + '/1-home.png' });
  await k(page, 'Enter'); await page.waitForSelector('.detail h1'); await page.waitForTimeout(300);
  await page.screenshot({ path: dir + '/2-detail.png' });
  await k(page, 'Enter'); await page.waitForSelector('.source'); await page.waitForTimeout(300);
  await page.screenshot({ path: dir + '/3-sources.png' });
  await page.route('https://media.test/**', () => {});
  await k(page, 'Enter'); await page.waitForTimeout(500); await k(page, 'ArrowUp');
  await page.screenshot({ path: dir + '/4-player.png' });
  await k(page, 'Backspace'); await k(page, 'Backspace'); await k(page, 'Backspace'); await k(page, 'Backspace');
  await k(page, 'ArrowDown'); await k(page, 'Enter'); await page.waitForSelector('.episode'); await page.waitForTimeout(300);
  await page.screenshot({ path: dir + '/5-series.png' });
});
