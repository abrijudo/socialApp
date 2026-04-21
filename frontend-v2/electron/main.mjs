import { app, BrowserWindow, desktopCapturer, ipcMain, session } from 'electron'

// WebCodecs (AudioData) + Insertable Streams: mejora odds de MediaStreamTrackGenerator usable.
app.commandLine.appendSwitch('enable-blink-features', 'WebCodecs')
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

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      // CommonJS: con sandbox:true el preload no se ejecuta como módulo ES (.mjs + import falla).
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  if (devServerUrl) {
    void win.loadURL(devServerUrl)
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    void win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => {
    if (permission === 'media' || permission === 'display-capture') return true
    return undefined
  })

  // Sin esto, Chromium puede dejar getDisplayMedia / getUserMedia (captura escritorio) en «Permission denied»
  // aunque el check anterior devuelva true. Ver ses.setPermissionRequestHandler en la doc de Electron.
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    if (permission === 'media' || permission === 'display-capture') {
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

  if (app.isPackaged) {
    autoUpdater.on('error', (err) => {
      console.warn('[autoUpdater]', err?.message ?? err)
    })
    void autoUpdater.checkForUpdatesAndNotify()
  }

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
