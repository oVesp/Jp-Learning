// Electron main process. Runs the existing Express server in-process on a
// random local port, then loads the UI in a native window.
import { app, BrowserWindow, shell, Menu } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let win;
let logPath;

// Electron's GUI process has no attached console, so mirror startup to a file
// in userData (…\japanese-database\main.log) for diagnosis.
function log(...args) {
  const line = `[${new Date().toISOString()}] ${args.join(' ')}`;
  console.log(line);
  try { if (logPath) fs.appendFileSync(logPath, line + '\n'); } catch {}
}

// show a fatal error in the window instead of a blank screen
function showError(msg) {
  const html = `data:text/html,<body style="background:%2314161a;color:%23e7e9ee;font:14px system-ui;padding:30px">
  <h2 style="color:%23f0584b">Jp-Learning failed to start</h2>
  <pre style="white-space:pre-wrap">${encodeURIComponent(msg)}</pre>
  <p style="color:%239aa3b2">See main.log in the app data folder.</p></body>`;
  if (!win) win = new BrowserWindow({ width: 700, height: 480, title: 'Jp-Learning', backgroundColor: '#14161a' });
  win.loadURL(html);
}

process.on('uncaughtException', (e) => log('uncaughtException:', e.stack || e.message));
process.on('unhandledRejection', (e) => log('unhandledRejection:', (e && e.stack) || String(e)));

function resourcePath(...p) {
  // packaged: read-only files live under resources/ ; dev: project root
  const base = app.isPackaged ? process.resourcesPath : path.join(__dirname, '..');
  return path.join(base, ...p);
}

function configurePaths() {
  // glossary (user data) → writable per-user location
  const userDir = app.getPath('userData');
  process.env.JPL_USER_DIR = userDir;
  // dictionary index (read-only) → bundled resources/data
  process.env.JPL_RES_DIR = resourcePath('data');

  // seed an initial glossary on first run (copy bundled one, else empty list)
  const userGlossary = path.join(userDir, 'glossary.json');
  if (!fs.existsSync(userGlossary)) {
    const seed = resourcePath('glossary.json');
    if (fs.existsSync(seed)) fs.copyFileSync(seed, userGlossary);
    else fs.writeFileSync(userGlossary, '[]');
  }
}

function createWindow(port) {
  win = new BrowserWindow({
    width: 1040,
    height: 820,
    minWidth: 720,
    minHeight: 560,
    title: 'Jp-Learning',
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    backgroundColor: '#14161a',
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  const appUrl = `http://127.0.0.1:${port}`;
  win.loadURL(appUrl);
  win.webContents.on('did-finish-load', () => log('window loaded', appUrl));
  win.webContents.on('did-fail-load', (_e, code, desc) => {
    log('did-fail-load', String(code), desc, '- retrying in 600ms');
    setTimeout(() => win && win.loadURL(appUrl), 600);
  });
  // open external links in the system browser, not the app window
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

function buildMenu() {
  const template = [
    { label: 'File', submenu: [{ role: 'quit' }] },
    {
      label: 'View',
      submenu: [{ role: 'reload' }, { role: 'toggleDevTools' }, { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }],
    },
    {
      label: 'Help',
      submenu: [{ label: 'Project on GitHub', click: () => shell.openExternal('https://github.com/oVesp/Jp-Learning') }],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// single instance
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
  });

  app.whenReady().then(async () => {
    try {
      configurePaths();
      logPath = path.join(app.getPath('userData'), 'main.log');
      log('starting — userData:', app.getPath('userData'), '| packaged:', app.isPackaged);
      log('JPL_RES_DIR:', process.env.JPL_RES_DIR);
      buildMenu();

      const { start } = await import('../src/server.js');
      const port = await start(0); // 0 = OS-assigned free port
      log('server listening on', String(port));
      createWindow(port);

      // auto-update (only in packaged builds; needs GitHub releases)
      if (app.isPackaged) {
        try {
          const { default: pkg } = await import('electron-updater');
          pkg.autoUpdater.checkForUpdatesAndNotify();
        } catch (e) {
          log('updater unavailable:', e.message);
        }
      }

      app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow(port);
      });
    } catch (e) {
      log('FATAL startup error:', e.stack || e.message);
      showError(e.stack || e.message);
    }
  });

  app.on('window-all-closed', () => app.quit());
}
