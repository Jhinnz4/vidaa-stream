// Fake Stremio account + addons, served through page.route (no network).
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

const CINE = 'https://cine.test/manifest.json';
const TORR = 'https://torr.test/manifest.json';
const SUBS = 'https://subs.test/manifest.json';

const addons = [
  { transportUrl: CINE, manifest: { id: 'cine', name: 'Cine', resources: ['catalog', 'meta'], types: ['movie', 'series'], idPrefixes: ['tt'],
    catalogs: [
      { type: 'movie', id: 'top', name: 'Populaires', extra: [{ name: 'search' }, { name: 'skip' }, { name: 'genre', options: ['Action', 'Drame'] }] },
      { type: 'series', id: 'top', name: 'Populaires', extra: [{ name: 'search' }, { name: 'skip' }] },
      { type: 'movie', id: 'searchonly', name: 'X', extra: [{ name: 'search', isRequired: true }] },
    ] } },
  { transportUrl: TORR, manifest: { id: 'torr', name: 'Torrentio RD', resources: ['stream'], types: ['movie', 'series'], idPrefixes: ['tt'], catalogs: [] } },
  { transportUrl: SUBS, manifest: { id: 'subs', name: 'Subs', resources: ['subtitles'], types: ['movie', 'series'], catalogs: [] } },
];

function metas(type, n, prefix) {
  return Array.from({ length: n }, (_, i) => ({ id: (type === 'movie' ? 'tt1' : 'tt2') + String(i).padStart(6, '0'), type,
    name: (prefix || (type === 'movie' ? 'Film ' : 'Série ')) + (i + 1), poster: 'https://img.test/p' + i + '.png', releaseInfo: '2020' }));
}

const movieStreams = [
  { name: '[RD+] Torrentio\n4k', title: 'Movie.2160p.BluRay.REMUX.DTS-HD.MA\n💾 40.1 GB ⚙️ X', url: 'https://media.test/a.mkv' },
  { name: '[RD+] Torrentio\n1080p', title: 'Movie.1080p.WEB.x264-GRP\n💾 2.1 GB ⚙️ X\n🇬🇧', url: 'https://media.test/b.mp4', behaviorHints: { bingeGroup: 'g1' } },
  { name: '[RD download] Torrentio\n1080p', title: 'Movie.MULTI.TRUEFRENCH.1080p.WEB\n💾 3 GB ⚙️ X\n🇫🇷 / 🇬🇧', url: 'https://media.test/c.mp4' },
  { name: 'Torrentio\n1080p', title: 'Torrent only', infoHash: 'abcdef' },
];

const SRT = '1\n00:00:00,000 --> 00:00:05,000\nBonjour <i>tout</i> le monde\n\n2\n00:00:06,000 --> 00:00:08,000\nLigne deux\n';

async function mock(page, { loggedIn = true, library = [] } = {}) {
  const calls = { catalogSearch: [], catalogExtra: [], puts: [], linkReads: 0 };
  if (loggedIn) await page.addInitScript(() => localStorage.setItem('sp_authKey', JSON.stringify('KEY')));
  await page.route('https://link.stremio.com/**', (route) => {
    const u = route.request().url();
    if (u.includes('/create')) return route.fulfill({ json: { result: { success: true, code: 'AB12', link: 'x', qrcode: 'https://img.test/qr.png' } } });
    calls.linkReads++;
    return route.fulfill({ json: calls.linkReads >= 2 ? { result: { authKey: 'KEY' } } : { error: { code: 101, message: 'wait' } } });
  });
  await page.route('https://api.strem.io/api/**', (route) => {
    const u = route.request().url();
    const body = route.request().postDataJSON() || {};
    if (u.endsWith('addonCollectionGet')) return route.fulfill({ json: { result: { addons } } });
    if (u.endsWith('datastoreGet')) return route.fulfill({ json: { result: library } });
    if (u.endsWith('datastorePut')) { calls.puts.push(body); return route.fulfill({ json: { result: { success: true } } }); }
    return route.fulfill({ json: { result: { success: true } } });
  });
  await page.route('https://img.test/**', (route) => route.fulfill({ body: PNG, contentType: 'image/png' }));
  await page.route('https://media.test/**', (route) => route.fulfill({ status: 404, body: '' }));
  await page.route('https://cine.test/**', (route) => {
    const u = decodeURIComponent(route.request().url());
    const m = u.match(/\/catalog\/(\w+)\/(\w+)(?:\/(.*))?\.json/);
    if (m) {
      const extra = m[3] || '';
      if (extra) calls.catalogExtra.push(extra);
      if (extra.startsWith('search=')) {
        calls.catalogSearch.push(extra.slice(7));
        return route.fulfill({ json: { metas: metas(m[1], 5, extra.slice(7) + ' ') } });
      }
      return route.fulfill({ json: { metas: metas(m[1], 20) } });
    }
    const mm = u.match(/\/meta\/(\w+)\/(\w+)\.json/);
    if (mm) {
      const meta = { id: mm[2], type: mm[1], name: mm[1] === 'movie' ? 'Le Film' : 'La Série', description: 'Desc', releaseInfo: '2020', genres: ['Drame'] };
      if (mm[1] === 'series') {
        meta.videos = [];
        for (let s = 1; s <= 2; s++) for (let e = 1; e <= 3; e++) meta.videos.push({ id: `${mm[2]}:${s}:${e}`, season: s, episode: e, title: `Ep ${s}x${e}` });
      }
      return route.fulfill({ json: { meta } });
    }
    return route.fulfill({ status: 404, body: '' });
  });
  await page.route('https://torr.test/**', (route) => route.fulfill({ json: { streams: movieStreams } }));
  await page.route('https://subs.test/**', (route) => {
    if (route.request().url().endsWith('.srt')) return route.fulfill({ body: SRT, contentType: 'text/plain' });
    return route.fulfill({ json: { subtitles: [
      { id: '1', lang: 'eng', url: 'https://subs.test/en.srt' }, { id: '2', lang: 'fre', url: 'https://subs.test/fr.srt' }] } });
  });
  return calls;
}

module.exports = { mock, addons };
