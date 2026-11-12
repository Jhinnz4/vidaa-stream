const { test } = require('@playwright/test');
const { mock } = require('./fixtures');
test.skip(!process.env.SHOTS, 'screenshots on demand');
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
test('phone look', async ({ page }) => {
  await mock(page);
  await page.goto('/');
  await page.locator('.profiles h1').waitFor();
  await page.screenshot({ path: process.env.SHOTS + '/p-profiles.png' });
  await page.locator('.profile-tile').first().tap();
  await page.locator('.row').nth(1).waitFor();
  await page.waitForTimeout(600);
  await page.screenshot({ path: process.env.SHOTS + '/p-home.png' });
  await page.evaluate(() => App.push(Views.detail('series', 'tt2000000')));
  await page.locator('.ep-row').first().waitFor();
  await page.waitForTimeout(400);
  await page.screenshot({ path: process.env.SHOTS + '/p-detail.png' });
  await page.evaluate(() => { App.pop(); App.section(() => Views.browse('movie')); });
  await page.waitForTimeout(800);
  await page.screenshot({ path: process.env.SHOTS + '/p-browse.png' });
  await page.evaluate(() => App.push(Views.player({ meta: { id: 'tt1000000', type: 'movie', name: 'Le Film' }, video: null,
      stream: { raw: { url: 'https://media.test/z.mp4' }, issues: [] }, startAt: 0, sources: [] })));
  await page.touchscreen.tap(195, 420);
  await page.waitForTimeout(500);
  await page.screenshot({ path: process.env.SHOTS + '/p-player.png' });
});
