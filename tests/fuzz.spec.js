const { test } = require('@playwright/test');
const { mock } = require('./fixtures');
// Random D-pad walks on each screen; reports focus that vanishes, lands off-screen,
// or enters the menu with something other than ←.
const state = (page) => page.evaluate(() => {
  const el = document.querySelector('.layer:last-child .focused');
  if (!el) return { none: true };
  const r = el.getBoundingClientRect();
  return { side: !!el.closest('.sidebar'), cls: el.className.split(' ')[0], text: el.textContent.trim().slice(0, 25),
    off: r.right < 0 || r.left > innerWidth || r.bottom < 0 || r.top > innerHeight, layers: document.querySelectorAll('.layer').length };
});
const screens = {
  home: async () => {},
  films: async (page) => { await page.evaluate(() => App.section(() => Views.browse('movie'))); },
  search: async (page) => { await page.evaluate(() => App.section(() => Views.search())); },
  list: async (page) => { await page.evaluate(() => App.section(() => Views.myList())); },
  settings: async (page) => { await page.evaluate(() => App.section(() => Views.settings())); },
  detailSeries: async (page) => { await page.evaluate(() => App.push(Views.detail('series', 'tt2000000'))); },
  detailFilm: async (page) => { await page.evaluate(() => App.push(Views.detail('movie', 'tt1000000'))); },
  streams: async (page) => { await page.evaluate(() => App.push(Views.streams({ id: 'tt1000000', type: 'movie', name: 'X' }, null, 0))); },
};
for (const [name, open] of Object.entries(screens)) {
  test('fuzz ' + name, async ({ page }) => {
    await mock(page);
    await page.goto('/');
    await page.locator('.profiles h1').waitFor();
    await page.keyboard.press('Enter');
    await page.locator('.row').nth(1).waitFor();
    await open(page);
    await page.waitForTimeout(800);
    const keys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
    let seed = 7, prev = await state(page), issues = new Set();
    const L0 = prev.layers;
    for (let i = 0; i < 250; i++) {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      const k = keys[seed % 4];
      await page.keyboard.press(k);
      await page.waitForTimeout(25);
      const s = await state(page);
      if (s.layers !== L0) { issues.add('layer change on ' + k); break; }
      if (s.none) issues.add('no focus after ' + k + ' from ' + prev.text);
      else {
        if (s.off) issues.add('off-screen focus ' + s.text + ' after ' + k);
        if (s.side && !prev.side && k !== 'ArrowLeft') issues.add('menu entered with ' + k + ' from ' + prev.cls + ' ' + prev.text);
      }
      prev = s;
    }
    require('@playwright/test').expect([...issues]).toEqual([]);
  });
}
