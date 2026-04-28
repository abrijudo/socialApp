import { app, BrowserWindow, desktopCapturer, ipcMain, session, Menu, protocol, net } from 'electron'

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
import { existsSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * Carga el UI vía `app://` (empaquetado) para un origen web coherente; con `loadFile` (`file://`)
 * los iframes de YouTube suelen mostrar error 153 (“configuración del reproductor”).
 * Debe registrarse antes de `app.ready`.
 */
try {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'app',
      privileges: { secure: true, standard: true, supportFetchAPI: true, stream: true },
    },
  ])
} catch {
  /* p. ej. doble carga en dev */
}
const require = createRequire(import.meta.url)
const appLoopback = require('./appLoopback.cjs')
/** Solo empaquetado: actualizaciones desde GitHub (electron-builder `publish`). */
const { autoUpdater } = require('electron-updater')

/**
 * URL del servidor Vite en desarrollo (p. ej. wait-on + cross-env).
 * Solo se usa si la app no está empaquetada; un .env suelto con ELECTRON_START_URL
 * no debe forzar `loadURL` en un .exe instalado.
 */
const devServerUrlRaw = process.env.ELECTRON_START_URL ?? process.env.VITE_DEV_SERVER_URL
const devServerUrl = devServerUrlRaw && !app.isPackaged ? devServerUrlRaw : ''

/**
 * `public/` solo en desarrollo; en el instalador el icono está en `build/` (see `ensure-electron-pack-assets`).
 * Rutas relativas a `electron/main.mjs` dentro del asar (no `process.resourcesPath` sin `extraResources`).
 */
const iconPath = app.isPackaged
  ? path.join(__dirname, '..', 'build', 'icon.png')
  : path.join(__dirname, '..', 'public', 'icon.png')

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

/**
 * Sirve `../dist` bajo `app://app/…` solo en build empaquetado. El documento deja de ser `file://`
 * (mejor para embeds de YouTube y otros iframes que rechazan orígenes file).
 */
function registerPackagedAppProtocol() {
  if (!app.isPackaged) return
  const distDir = path.resolve(path.join(__dirname, '..', 'dist'))
  protocol.handle('app', (request) => {
    const u = new URL(request.url)
    if (u.hostname !== 'app') {
      return new Response('Not Found', { status: 404 })
    }
    let pathname = u.pathname
    if (!pathname || pathname === '/') pathname = '/index.html'
    let rel
    try {
      rel = decodeURIComponent(pathname).replace(/^\/+/, '')
    } catch {
      return new Response('Bad Request', { status: 400 })
    }
    if (!rel || rel.includes('..') || path.isAbsolute(rel)) {
      return new Response('Forbidden', { status: 403 })
    }
    const filePath = path.join(distDir, rel)
    const normalized = path.normalize(filePath)
    const underDist = distDir + path.sep
    if (normalized !== distDir && !normalized.startsWith(underDist)) {
      return new Response('Forbidden', { status: 403 })
    }
    if (!existsSync(normalized) || !statSync(normalized).isFile()) {
      return new Response('Not Found', { status: 404 })
    }
    return net.fetch(pathToFileURL(normalized).toString()).catch(() => new Response('Not Found', { status: 404 }))
  })
}

function createWindow() {
  const isMac = process.platform === 'darwin'
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    icon: iconPath,
    /** Alineado al fondo `oklch(0.195 0.022 276)` del tema (sin flash distinto al arrancar). */
    backgroundColor: '#0e0d14',
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
  } else if (app.isPackaged) {
    void win.loadURL('app://app/index.html')
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

/**
 * Misma lógica que el fallback de `getApiBaseUrl` en el renderer (Vercel).
 * En instalaciones, se puede anular con la variable de entorno `ELECTRON_API_ORIGIN`
 * (sin recompilar el renderer) para apuntar a un backend de staging, etc.
 */
const PRODUCTION_API_ORIGIN = (process.env.ELECTRON_API_ORIGIN || 'https://social-app-blue-three.vercel.app')
  .trim()
  .replace(/\/$/, '')

function setupIpcApiOrigin() {
  ipcMain.on('electron:sync-api-origin', (event) => {
    const isDev = !app.isPackaged
    event.returnValue = isDev ? 'http://localhost:3000' : PRODUCTION_API_ORIGIN
  })
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

/** Caché de usuario aislada en dev (evita “Acceso denegado” al compartir perfil con la app instalada). */
if (!app.isPackaged) {
  app.setPath('userData', path.join(process.cwd(), 'electron-data-dev'))
}

// Descomenta si la ventana sale negra u otros fallos de GPU:
// app.disableHardwareAcceleration();

/** Mismo origen que `loadURL('app://app/index.html')` en el build instalado. */
const PACKAGED_APP_ORIGIN = 'app://app'

/**
 * Con el UI en `app://` (y no en `file://`) el `fetch` a APIs HTTPS envía `Origin: app://app` y
 * Vercel/Supabase suelen no incluirlo en CORS. En Electron se corrige inyectando encabezados
 * CORS en la respuesta (solo .exe, solo hosts del backend/Supabase).
 */
function isPackagedCorsPatchUrl(url) {
  if (!app.isPackaged) return false
  try {
    const u = new URL(url)
    if (u.protocol === 'wss:') {
      return u.hostname.endsWith('.supabase.co')
    }
    if (u.protocol !== 'https:') return false
    if (u.hostname === new URL(PRODUCTION_API_ORIGIN).hostname) return true
    if (u.hostname.endsWith('.vercel.app')) return true
    if (u.hostname.endsWith('.supabase.co')) return true
  } catch {
    /* ignore */
  }
  return false
}

/** Inyecta CORS en la copia de cabeceras que recibe el renderer. */
function applyPackagedCorsToResponseHeaders(details, sh) {
  if (!isPackagedCorsPatchUrl(details.url)) return
  for (const k of Object.keys(sh)) {
    if (k.toLowerCase() === 'access-control-allow-origin') {
      delete sh[k]
    }
  }
  sh['Access-Control-Allow-Origin'] = [PACKAGED_APP_ORIGIN]
}

/**
 * Fija Content-Security-Policy en el documento del renderer para silenciar el aviso de Electron.
 * - Producción: `script-src` incluye `'unsafe-inline'` (y `blob:`) porque el `index.html` de Vite
 *   empaquetado usa scripts alineados / el mismo mecanismo que chocaba con `script-src 'self'` puro.
 *   No se añade `unsafe-eval` en prod (más duro con eval).
 * - Dev: HMR mantiene `unsafe-eval` además.
 * - Empaquetado: además, parchea CORS a API/Supabase (ver `applyPackagedCorsToResponseHeaders`).
 */
function setupContentSecurityPolicy() {
  const isViteDev = Boolean(devServerUrl)
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const sh = { ...(details.responseHeaders || {}) }
    applyPackagedCorsToResponseHeaders(details, sh)
    if (details.resourceType === 'mainFrame') {
      for (const k of Object.keys(sh)) {
        if (k.toLowerCase() === 'content-security-policy') {
          delete sh[k]
        }
      }
      const csp = isViteDev
        ? "default-src 'self'; base-uri 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: https: http: blob:; font-src 'self' data: https:; connect-src 'self' http://localhost:3000 http://127.0.0.1:* http://localhost:* https://social-app-blue-three.vercel.app https: wss: ws://127.0.0.1:* ws://localhost:* https://*.supabase.co wss://*.supabase.co; media-src 'self' blob: https:; worker-src 'self' blob:; frame-src 'self' https:;"
        : "default-src 'self'; base-uri 'self'; script-src 'self' 'unsafe-inline' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: https: http: blob:; font-src 'self' data: https:; connect-src 'self' http://localhost:3000 https://social-app-blue-three.vercel.app https://*.vercel.app https://*.supabase.co wss://*.supabase.co http: https: ws: wss:; media-src 'self' blob: https:; worker-src 'self' blob:; frame-src 'self' https:;"
      sh['Content-Security-Policy'] = [csp]
    }
    callback({ responseHeaders: sh })
  })
}

/**
 * Peticiones a dominios de YouTube desde el embed con origen de app/WEB sin referer "normal" a veces
 * devuelven error 153. En build empaquetado fijamos `Origin` y `Referer` al sitio público (mismo
 * host que CORS a API / confianza de embed). Patrones: sintaxis de filtro de `webRequest` (Electron).
 */
function setupYouTubeEmbedRequestHeaders() {
  /** En dev (Vite) también aplicar: sin Referer/Origin “normales”, el embed puede devolver error 153. */
  let origin
  let referer
  if (app.isPackaged) {
    origin = new URL(PRODUCTION_API_ORIGIN).origin
    referer = `${origin}/`
  } else if (devServerUrl) {
    try {
      const u = new URL(devServerUrl)
      origin = u.origin
      referer = `${origin}/`
    } catch {
      return
    }
  } else {
    return
  }
  session.defaultSession.webRequest.onBeforeSendHeaders(
    {
      urls: [
        '*://*.youtube.com/*',
        '*://youtube.com/*',
        '*://*.youtube-nocookie.com/*',
        '*://youtube-nocookie.com/*',
        '*://*.googlevideo.com/*',
      ],
    },
    (details, callback) => {
      const requestHeaders = { ...details.requestHeaders }
      for (const k of Object.keys(requestHeaders)) {
        const l = k.toLowerCase()
        if (l === 'origin' || l === 'referer') {
          delete requestHeaders[k]
        }
      }
      requestHeaders.Origin = origin
      requestHeaders.Referer = referer
      callback({ requestHeaders })
    },
  )
}

app.whenReady().then(() => {
  registerPackagedAppProtocol()
  setupContentSecurityPolicy()
  setupYouTubeEmbedRequestHeaders()
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
  setupIpcApiOrigin()
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
