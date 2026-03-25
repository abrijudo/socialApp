const path = require('path');
const { app, BrowserWindow, shell, session, desktopCapturer, ipcMain } = require('electron');

let mainWindow = null;
let bootedInternalServer = false;
const safeUserDataDir = path.join(app.getPath('appData'), 'socialapp-pro-electron');
app.setPath('userData', safeUserDataDir);
// Habilitar aceleración por hardware para mejor rendimiento de video/audio en transmisiones.
// Si hay problemas (ventana en negro, cuelgues), descomenta: app.disableHardwareAcceleration();
let pendingCaptureSourceId = null;

async function canReach(url) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    return res.ok;
  } catch (_) {
    return false;
  }
}

async function waitForServer(url, timeoutMs = 20000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await canReach(url)) return true;
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  return false;
}

async function ensureServer(url) {
  // Dar tiempo al servidor externo (npm run dev) si está arrancando
  for (let i = 0; i < 5; i++) {
    if (await canReach(url)) return;
    await new Promise((r) => setTimeout(r, 600));
  }
  if (!bootedInternalServer) {
    try {
      require(path.join(app.getAppPath(), 'server.js'));
    } catch (err) {
      const isAddrInUse = err?.code === 'EADDRINUSE' || err?.errno === 'EADDRINUSE' || /EADDRINUSE/i.test(String(err?.message || ''));
      if (!isAddrInUse) throw err;
      // Puerto 3000 ocupado: el servidor ya corre. Esperamos a que responda.
    }
    bootedInternalServer = true;
  }
  const ok = await waitForServer(url);
  if (!ok) throw new Error('No se pudo iniciar el servidor local para Electron.');
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#1e1f22',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Solo herramientas de desarrollo al ejecutar sin empaquetar (`electron .`).
  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

async function pickFallbackDisplaySource() {
  const sources = await desktopCapturer.getSources({
    types: ['screen', 'window'],
    thumbnailSize: { width: 0, height: 0 },
    fetchWindowIcons: false,
  });
  if (!sources.length) return null;
  return sources.find((src) => src.id.startsWith('screen:')) || sources[0];
}

async function listDisplaySources() {
  const sources = await desktopCapturer.getSources({
    types: ['screen', 'window'],
    thumbnailSize: { width: 320, height: 180 },
    fetchWindowIcons: true,
  });
  return sources.map((source) => ({
    id: source.id,
    name: source.name,
    displayId: source.display_id || '',
    kind: source.id.startsWith('screen:') ? 'screen' : 'window',
    thumbnailDataUrl: source.thumbnail?.isEmpty() ? '' : source.thumbnail.toDataURL(),
    appIconDataUrl: source.appIcon?.isEmpty?.() ? '' : (source.appIcon ? source.appIcon.toDataURL() : ''),
  }));
}

function setupIpcHandlers() {
  ipcMain.handle('desktop:list-capture-sources', async () => {
    return listDisplaySources();
  });
  ipcMain.handle('desktop:set-capture-source', async (_event, sourceId) => {
    pendingCaptureSourceId = typeof sourceId === 'string' ? sourceId : null;
    return { ok: true };
  });
}

function setupDisplayCaptureHandling() {
  session.defaultSession.setDisplayMediaRequestHandler(
    async (request, callback) => {
      try {
        let source;
        if (request.videoRequested) {
          if (pendingCaptureSourceId) {
            const sources = await desktopCapturer.getSources({
              types: ['screen', 'window'],
              thumbnailSize: { width: 0, height: 0 },
              fetchWindowIcons: false,
            });
            source = sources.find((s) => s.id === pendingCaptureSourceId);
          }
          if (!source) source = await pickFallbackDisplaySource();
        }
        callback({
          video: source || undefined,
          audio: 'loopback',
        });
        pendingCaptureSourceId = null;
      } catch (_) {
        callback({
          audio: 'loopback',
        });
        pendingCaptureSourceId = null;
      }
    },
    { useSystemPicker: false }
  );
}

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
// NO usar force-wave-audio: fuerza WaveOut (legacy) que puede causar sonidos robóticos.
// Por defecto Chromium usa WASAPI (Core Audio) con mejor calidad para loopback.
// Allow WebRTC to use loopback audio; evitar EcoQoS en segundo plano (causa audio robótico en Win11)
app.commandLine.appendSwitch('disable-features', 'WebRtcHideLocalIpsWithMdns,UseEcoQoSForBackgroundProcess');
// Habilitar rasterización GPU para mejor rendimiento de video
app.commandLine.appendSwitch('enable-gpu-rasterization');

app.whenReady().then(async () => {
  const appUrl = 'http://localhost:3000';

  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    const allowed = new Set(['media', 'display-capture', 'fullscreen', 'notifications']);
    callback(allowed.has(permission));
  });
  setupIpcHandlers();
  setupDisplayCaptureHandling();

  await ensureServer(appUrl);
  createMainWindow();
  await mainWindow.loadURL(appUrl);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
