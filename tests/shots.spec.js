// Visual check only (not part of the default run): SHOTS=1 npx playwright test shots
const { test } = require('@playwright/test');
const { mock } = require('./fixtures');
const dir = process.env.SHOTS_DIR || 'test-results/shots';
test.skip(!process.env.SHOTS, 'screenshots only on demand');
test.use({ viewport: { width: 1920, height: 1080 } });
const k = async (p, key, n = 1) => { for (let i = 0; i < n; i++) { await p.keyboard.press(key); await p.waitForTimeout(80); } };
test('screens', async ({ page }) => {
  await mock(page);
  // Give previews artwork/descriptions like Cinemeta does.
  await page.route('https://images.metahub.space/**', (r) => r.fulfill({ status: 404, body: '' }));
  await page.addInitScript(() => {
    localStorage.setItem('sp_profiles', JSON.stringify([
      { id: 'p1', name: 'Moi', avatar: 0, owner: true, prefs: {}, items: [], searches: ['matrix', 'dune'] },
      { id: 'p2', name: 'Léa', avatar: 1, owner: false, prefs: {}, items: [], searches: [] },
      { id: 'p3', name: 'Enfants', avatar: 6, owner: false, prefs: {}, items: [], searches: [] }]));
  });
  await page.goto('/');
  await page.waitForSelector('.profiles');
  await page.waitForTimeout(300);
  await page.screenshot({ path: dir + '/1-profiles.png' });
  await k(page, 'Enter');
  await page.waitForSelector('.row'); await page.waitForTimeout(700);
  await k(page, 'ArrowRight', 2); await page.waitForTimeout(500);
  await page.screenshot({ path: dir + '/2-home.png' });
  await k(page, 'ArrowLeft', 4); await page.waitForTimeout(300);
  await page.screenshot({ path: dir + '/3-sidebar.png' });
  await k(page, 'ArrowUp', 8); await k(page, 'ArrowDown'); await k(page, 'Enter'); await page.waitForTimeout(300);
  await page.keyboard.type('mat', { delay: 50 }); await page.waitForTimeout(1200);
  await page.screenshot({ path: dir + '/4-search.png' });
  await page.evaluate(() => App.section(function () { return Views.browse('movie'); })); await page.waitForTimeout(600);
  await page.screenshot({ path: dir + '/5-browse.png' });
  await page.evaluate(() => App.push(Views.profileEdit(Profiles.byId('p2')))); await page.waitForTimeout(300);
  await page.screenshot({ path: dir + '/6-profile-edit.png' });
  await page.evaluate(() => { App.pop(); App.section(null); App.push(Views.detail('movie', 'tt1000000')); }); await page.waitForTimeout(600);
  await page.screenshot({ path: dir + '/7-detail.png' });
});
