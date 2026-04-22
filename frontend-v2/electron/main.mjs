import { app, BrowserWindow, desktopCapturer, ipcMain, session, Menu } from 'electron'

/*
 * Flags de Chromium (deben registrarse antes del primer ciclo de vida / ready del app).
 * Objetivo: rasterizado GPU, menos throttling al compartir pantalla con la ventana en segundo plano,
 * y pipeline WebRTC más agresivo cuando el SO lo permite.
 */
app.commandLine.appendSwitch('enable-blink-features', 'WebCodecs')
app.commandLine.appendSwitch('enable-gpu-rasterization')
app.commandLine.appendSwitch('enable-zero-copy')
/** En GPUs “no listadas” por Chromium ayuda a no degradar aceleración (si ves glitches, pon ELECTRON_USE_GPU_BLOCKLIST=1). */
if (process.env.ELECTRON_USE_GPU_BLOCKLIST !== '1') {
  app.commandLine.appendSwitch('ignore-gpu-blocklist')
}
/** Reduce el throttling del renderer cuando la ventana pierde foco (p. ej. jugando en pantalla completa compartida). */
app.commandLine.appendSwitch('disable-renderer-backgrounding')
app.commandLine.appendSwitch('disable-background-timer-throttling')
/** Windows: asegura participación en el pipeline High-DPI del SO (no usa el mapa de bits 1x). */
if (process.platform === 'win32') {
  app.commandLine.appendSwitch('high-dpi-support', '1')
}
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const appLoopback = require('./appLoopback.cjs')
/** Solo empaquetado: actualizaciones desde GitHub (electron-builder `publish`). */
const { autoUpdater } = require('electron-updater')

/** URL del servidor Vite en desarrollo (p. ej. wait-on + cross-env). */
const devServerUrl = process.env.ELECTRON_START_URL ?? process.env.VITE_DEV_SERVER_URL

/**
 * Selección pendiente para `setDisplayMediaRequestHandler` (renderer llama a
 * `getDisplayMedia` justo después de `electron:arm-display-media-pick`).
 * @type {{ sourceId: string; wantLoopbackAudio: boolean } | null}
 */
let pendingDisplayMediaRequest = null

/** @type {BrowserWindow | null} */
let mainWindow = null
let autoUpdaterSetupDone = false

function sendUpdaterToRenderer(channel, ...args) {
  const w = BrowserWindow.getAllWindows()[0] ?? mainWindow
  if (w && !w.isDestroyed()) {
    w.webContents.send(channel, ...args)
  }
}

function setupAutoUpdater() {
  if (autoUpdaterSetupDone) return
  autoUpdaterSetupDone = true

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('error', (err) => {
    console.warn('[autoUpdater]', err?.message ?? err)
  })

  autoUpdater.on('update-available', (info) => {
    const v = info?.version != null ? String(info.version) : ''
    console.log('[autoUpdater] Nueva versión disponible:', v)
    sendUpdaterToRenderer('electron:update-available', v)
  })

  autoUpdater.on('download-progress', (progress) => {
    sendUpdaterToRenderer('electron:update-download-progress', {
      percent: progress.percent,
      transferred: progress.transferred,
      total: progress.total,
    })
  })

  autoUpdater.on('update-downloaded', (info) => {
    console.log('[autoUpdater] Descarga lista:', info?.version)
    sendUpdaterToRenderer('electron:update-ready')
  })

  ipcMain.on('electron:start-update-download', () => {
    void autoUpdater.downloadUpdate().catch((e) => {
      console.warn('[autoUpdater] downloadUpdate', e)
    })
  })

  ipcMain.on('electron:install-update', () => {
    autoUpdater.quitAndInstall(false, true)
  })

  void autoUpdater.checkForUpdates()
  setInterval(() => {
    void autoUpdater.checkForUpdates()
  }, 4 * 60 * 60 * 1000)
}

function createWindow() {
  const isMac = process.platform === 'darwin'
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    /** Misma apariencia que el tema oscuro de la app (zinc-950) para no ver un corte bajo el chrome. */
    backgroundColor: '#09090b',
    /** `useContentSize` evita borrosidad por diferencias tamaño cliente vs DIP en algunos layouts. */
    useContentSize: true,
    /**
     * Windows/Linux: marco personalizado (barra en React) para alinearse con el resto de la UI.
     * macOS: tráfico nativo y barra con `hiddenInset` (contenido bajo título, semáforos en overlay).
     */
    frame: isMac,
    titleBarStyle: isMac ? 'hiddenInset' : undefined,
    trafficLightPosition: isMac ? { x: 12, y: 10 } : undefined,
    webPreferences: {
      // CommonJS: con sandbox:true el preload no se ejecuta como módulo ES (.mjs + import falla).
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      /** Timers y animaciones del UI no se limitan tanto si la ventana queda detrás mientras se transmite. */
      backgroundThrottling: false,
    },
  })

  mainWindow = win

  if (devServerUrl) {
    void win.loadURL(devServerUrl)
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    void win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }

  if (!isMac) {
    win.on('maximize', () => {
      if (!win.isDestroyed()) {
        win.webContents.send('electron:window-state', { maximized: true })
      }
    })
    win.on('unmaximize', () => {
      if (!win.isDestroyed()) {
        win.webContents.send('electron:window-state', { maximized: false })
      }
    })
  }
}

function setupIpcWindowControls() {
  ipcMain.on('electron:window-min', () => {
    const w = BrowserWindow.getFocusedWindow() ?? mainWindow
    if (w && !w.isDestroyed()) w.minimize()
  })
  ipcMain.on('electron:window-max', () => {
    const w = BrowserWindow.getFocusedWindow() ?? mainWindow
    if (!w || w.isDestroyed()) return
    if (w.isMaximized()) w.unmaximize()
    else w.maximize()
  })
  ipcMain.on('electron:window-close', () => {
    const w = BrowserWindow.getFocusedWindow() ?? mainWindow
    if (w && !w.isDestroyed()) w.close()
  })
  ipcMain.handle('electron:window-is-maximized', (event) => {
    const w = BrowserWindow.fromWebContents(event.sender) ?? mainWindow
    if (!w || w.isDestroyed()) return false
    return w.isMaximized()
  })
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => {
    if (
      permission === 'media' ||
      permission === 'display-capture' ||
      permission === 'fullscreen'
    ) {
      return true
    }
    return undefined
  })

  // Sin esto, Chromium puede dejar getDisplayMedia / getUserMedia (captura escritorio) en «Permission denied»
  // aunque el check anterior devuelva true. Ver ses.setPermissionRequestHandler en la doc de Electron.
  // `fullscreen`: sin callback(true), element.requestFullscreen() falla en Electron (p. ej. vídeo de transmisión).
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    if (permission === 'media' || permission === 'display-capture' || permission === 'fullscreen') {
      callback(true)
      return
    }
    callback(false)
  })

  // Ruta soportada por Electron/Chromium actual: el renderer hace getDisplayMedia y aquí
  // concedemos el DesktopCapturerSource elegido en nuestro diálogo (mejor que GUM+mandatory).
  session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
    const pending = pendingDisplayMediaRequest
    pendingDisplayMediaRequest = null

    if (!pending?.sourceId) {
      try {
        callback()
      } catch {
        /* noop */
      }
      return
    }

    void desktopCapturer
      .getSources({
        types: ['window', 'screen'],
        thumbnailSize: { width: 1, height: 1 },
        fetchWindowIcons: false,
      })
      .then((sources) => {
        const match = sources.find((s) => s.id === pending.sourceId)
        if (!match) {
          console.warn('[electron] display-media: id no encontrado entre getSources()', pending.sourceId)
          try {
            callback()
          } catch {
            /* noop */
          }
          return
        }
        try {
          const grant = { video: match }
          if (pending.wantLoopbackAudio && request.audioRequested) {
            grant.audio = 'loopback'
          }
          callback(grant)
        } catch (e) {
          console.error('[electron] display-media: callback(grant) falló', e)
          try {
            callback()
          } catch {
            /* noop */
          }
        }
      })
      .catch((e) => {
        console.error('[electron] display-media: getSources', e)
        try {
          callback()
        } catch {
          /* noop */
        }
      })
  })

  ipcMain.handle('electron:arm-display-media-pick', async (_event, payload) => {
    if (!payload || typeof payload.sourceId !== 'string' || payload.sourceId.length === 0) {
      return false
    }
    pendingDisplayMediaRequest = {
      sourceId: payload.sourceId,
      wantLoopbackAudio: Boolean(payload.wantLoopbackAudio),
    }
    return true
  })

  ipcMain.handle('electron:cancel-display-media-pick', () => {
    pendingDisplayMediaRequest = null
    return true
  })

  ipcMain.handle('electron:get-desktop-sources', async (event, opts) => {
    const thumbnailSize = opts?.thumbnailSize ?? { width: 320, height: 180 }
    const sources = await desktopCapturer.getSources({
      types: opts?.types ?? ['window', 'screen'],
      fetchWindowIcons: true,
      thumbnailSize,
    })

    /** Misma forma que `DesktopCapturerSource.id` / `webContents.getMediaSourceId()`. */
    let selfMediaSourceId = null
    try {
      const win = BrowserWindow.fromWebContents(event.sender)
      selfMediaSourceId = win?.webContents.getMediaSourceId() ?? null
    } catch {
      selfMediaSourceId = null
    }

    const rows = sources
      .filter((s) => (selfMediaSourceId ? s.id !== selfMediaSourceId : true))
      .map((s) => ({
        id: s.id,
        name: s.name,
        display_id: s.display_id,
        thumbnailDataUrl: s.thumbnail?.toDataURL?.() ?? '',
        /** 'window' | 'screen' — inferido del id de Chromium. */
        sourceType: s.id.startsWith('screen:') ? 'screen' : 'window',
      }))
    return await appLoopback.enrichSourcesWithProcessId(rows)
  })

  appLoopback.registerAppLoopbackIpc(ipcMain)

  /** Sin menú nativo (File, Edit, View…) al estilo de apps modernas. */
  Menu.setApplicationMenu(null)
  setupIpcWindowControls()

  createWindow()

  if (app.isPackaged && mainWindow) {
    mainWindow.webContents.once('did-finish-load', () => {
      setupAutoUpdater()
    })
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
