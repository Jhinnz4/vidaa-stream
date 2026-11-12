// Stream+ for PC: a window on the web app (always the latest version).
// F11 = full screen, F5 = reload. Links leaving the app open in the normal browser.
const { app, BrowserWindow, shell } = require('electron');
const path = require('path');

const URL = 'https://jhinnz4.github.io/vidaa-stream/';
app.commandLine.appendSwitch('enable-features', 'PlatformHEVCDecoderSupport');

function offlinePage() {
  return 'data:text/html;charset=utf-8,' + encodeURIComponent(
    '<body style="margin:0;background:#0b0c10;color:#f4f5f7;font-family:Segoe UI,sans-serif;display:flex;' +
    'align-items:center;justify-content:center;height:100vh;text-align:center">' +
    '<div><h1 style="color:#7b5cff">Stream+</h1><p>Pas de connexion Internet.</p>' +
    '<button onclick="location.href=\'' + URL + '\'" style="font-size:1.1rem;padding:.7rem 1.4rem;border:0;' +
    'border-radius:.5rem;background:#7b5cff;color:#fff;cursor:pointer">Réessayer</button></div></body>');
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1366, height: 800, minWidth: 900, minHeight: 540,
    backgroundColor: '#0b0c10', title: 'Stream+', autoHideMenuBar: true,
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: { autoplayPolicy: 'no-user-gesture-required', spellcheck: false }
  });
  win.removeMenu();
  win.loadURL(URL);
  win.webContents.on('did-fail-load', (_e, code, _desc, url, isMain) => {
    if (isMain && code !== -3 && url.startsWith('http')) win.loadURL(offlinePage());
  });
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11') { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
    if (input.key === 'F5') { win.webContents.reload(); e.preventDefault(); }
  });
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(URL) && !url.startsWith('data:')) { e.preventDefault(); shell.openExternal(url); }
  });
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => {
    const w = BrowserWindow.getAllWindows()[0];
    if (w) { if (w.isMinimized()) w.restore(); w.focus(); }
  });
  app.whenReady().then(createWindow);
  app.on('window-all-closed', () => app.quit());
}
