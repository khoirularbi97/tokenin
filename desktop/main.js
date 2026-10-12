// Proses utama aplikasi desktop Tokenin (Windows, macOS, Linux).
const { app, BrowserWindow, Menu, Notification, Tray, nativeImage, protocol, shell, ipcMain } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { HOST, handle } = require('./serve');

const isMac = process.platform === 'darwin';
// Mode pengembangan: muat Vite dev server, contoh: npm run dev  (atau electron . --dev-url=http://localhost:5173)
const DEV_URL =
  process.env.TOKENIN_DEV_URL ||
  (process.argv.find((a) => a.startsWith('--dev-url=')) || '').slice('--dev-url='.length) ||
  null;
const RENDERER_DIR = path.join(__dirname, 'renderer');
const APP_URL = `app://${HOST}/`;

// Harus didaftarkan sebelum app siap. Skema "standard + secure" membuat app://tokenin
// berperilaku seperti situs https: punya origin sendiri, fetch, WebSocket, dan localStorage.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true },
  },
]);

if (process.platform === 'win32') app.setAppUserModelId('id.tokenin.desktop');

let mainWindow = null;
let tray = null;
let quitting = false;
let trayHintShown = false;

// ---------- Ukuran jendela diingat antar sesi ----------
const stateFile = () => path.join(app.getPath('userData'), 'window-state.json');

function loadWindowState() {
  try {
    const s = JSON.parse(fs.readFileSync(stateFile(), 'utf8'));
    if (s.width >= 380 && s.height >= 560) return s;
  } catch {
    /* pakai ukuran bawaan */
  }
  return { width: 1280, height: 860 };
}

function saveWindowState() {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isMinimized()) return;
  const bounds = mainWindow.getNormalBounds();
  try {
    fs.writeFileSync(stateFile(), JSON.stringify({ ...bounds, maximized: mainWindow.isMaximized() }));
  } catch {
    /* tidak kritis */
  }
}

// ---------- Jendela utama ----------
function isAppUrl(url) {
  if (DEV_URL) return url.startsWith(DEV_URL);
  return url.startsWith(APP_URL);
}

function createWindow() {
  const state = loadWindowState();
  mainWindow = new BrowserWindow({
    x: state.x,
    y: state.y,
    width: state.width,
    height: state.height,
    minWidth: 380,
    minHeight: 560,
    title: 'Tokenin',
    backgroundColor: '#070B14',
    show: false,
    autoHideMenuBar: true,
    icon: isMac ? undefined : path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: false,
    },
  });

  if (state.maximized) mainWindow.maximize();
  mainWindow.once('ready-to-show', () => mainWindow.show());

  // Link keluar (dokumentasi, marketplace) dibuka di browser bawaan, bukan di dalam aplikasi
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isAppUrl(url)) {
      event.preventDefault();
      if (/^https?:\/\//.test(url)) shell.openExternal(url);
    }
  });

  // Menutup jendela = sembunyikan ke tray, supaya notifikasi kWh tetap masuk
  mainWindow.on('close', (event) => {
    saveWindowState();
    if (quitting) return;
    event.preventDefault();
    mainWindow.hide();
    if (!trayHintShown && !isMac && Notification.isSupported()) {
      trayHintShown = true;
      new Notification({
        title: 'Tokenin tetap berjalan',
        body: 'Aplikasi ada di tray. Klik kanan ikonnya lalu pilih Keluar untuk menutup sepenuhnya.',
      }).show();
    }
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  mainWindow.on('resize', debounce(saveWindowState, 500));
  mainWindow.on('move', debounce(saveWindowState, 500));

  mainWindow.loadURL(DEV_URL || APP_URL);
}

function showWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

// ---------- Tray ----------
function createTray() {
  const icon = isMac
    ? nativeImage.createFromPath(path.join(__dirname, 'assets', 'trayTemplate.png'))
    : nativeImage.createFromPath(path.join(__dirname, 'assets', 'tray.png'));
  if (isMac) icon.setTemplateImage(true);
  tray = new Tray(icon);
  tray.setToolTip('Tokenin');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Buka Tokenin', click: showWindow },
      { type: 'separator' },
      {
        label: 'Keluar',
        click: () => {
          quitting = true;
          app.quit();
        },
      },
    ])
  );
  tray.on('click', showWindow);
}

// ---------- Menu ----------
function createMenu() {
  if (isMac) {
    // macOS butuh menu Edit supaya Cmd+C / Cmd+V berfungsi
    Menu.setApplicationMenu(
      Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'viewMenu' }, { role: 'windowMenu' }])
    );
  } else {
    Menu.setApplicationMenu(null);
  }
}

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

// ---------- Siklus hidup aplikasi ----------
if (!app.requestSingleInstanceLock()) {
  // Tokenin sudah terbuka: fokuskan jendela yang ada, jangan buka dua kali
  app.quit();
} else {
  app.on('second-instance', showWindow);

  ipcMain.on('tokenin:version', (event) => {
    event.returnValue = app.getVersion();
  });

  app.whenReady().then(() => {
    protocol.handle('app', (request) => handle(RENDERER_DIR, request));

    // Izin yang diberikan ke halaman: hanya notifikasi dan salin ke clipboard
    const allowed = new Set(['notifications', 'clipboard-sanitized-write']);
    const session = require('electron').session.defaultSession;
    session.setPermissionRequestHandler((_wc, permission, callback) => callback(allowed.has(permission)));
    session.setPermissionCheckHandler((_wc, permission) => allowed.has(permission));

    createMenu();
    createWindow();
    createTray();

    app.on('activate', showWindow); // klik ikon di Dock macOS
  });

  app.on('before-quit', () => {
    quitting = true;
  });

  // Jendela disembunyikan ke tray, bukan ditutup, jadi aplikasi tidak berhenti di sini
  app.on('window-all-closed', () => {});
}
