'use strict'

/**
 * Formato PCM del binario ApplicationLoopback (alineado con el renderer).
 * Si el nativo cambiara, habría que leerlo del proceso o de cabeceras del stream.
 */
const WASAPI_LOOPBACK_SAMPLE_RATE_HZ = 48_000
const WASAPI_LOOPBACK_CHANNELS = 2

const { createRequire } = require('node:module')
const path = require('node:path')

const requireFrom = createRequire(__filename)

/** @type {null | false | import('application-loopback')} */
let loopbackModule = null

function getLoopback() {
  if (process.platform !== 'win32' || process.arch !== 'x64') return null
  if (loopbackModule === false) return null
  if (loopbackModule) return loopbackModule
  try {
    const al = requireFrom('application-loopback')
    const pkgJson = requireFrom.resolve('application-loopback/package.json')
    const binRoot = path.join(path.dirname(pkgJson), 'bin')
    al.setExecutablesRoot(binRoot)
    loopbackModule = al
    return al
  } catch (e) {
    console.warn('[electron] application-loopback no cargado:', e)
    loopbackModule = false
    return null
  }
}

/** @param {string} id p. ej. window:12345:0 — XX es window handle (HWND) en la doc de Electron */
function xxFromElectronWindowSourceId(id) {
  if (typeof id !== 'string' || !id.startsWith('window:')) return null
  const parts = id.split(':')
  return parts.length >= 2 ? parts[1].trim() : null
}

/**
 * Variantes de string para cruzar el HWND de Chromium con el que devuelve el addon nativo.
 * (decimal, hex con/sin 0x, mayúsculas)
 * @param {string} raw
 */
function hwndLookupKeys(raw) {
  const s = String(raw ?? '').trim()
  if (!s) return []
  /** @type {Set<string>} */
  const out = new Set([s, s.toLowerCase()])
  const dec = Number.parseInt(s, 10)
  if (!Number.isNaN(dec) && dec > 0) {
    out.add(String(dec))
    const h = dec.toString(16)
    out.add(h)
    out.add(h.toUpperCase())
    out.add(`0x${h}`)
    out.add(`0x${h.toUpperCase()}`)
  }
  const hexBare = s.replace(/^0x/i, '')
  const fromHex = Number.parseInt(hexBare, 16)
  if (!Number.isNaN(fromHex) && fromHex > 0) {
    out.add(String(fromHex))
  }
  return [...out]
}

/**
 * Resuelve PID para `window:XX:YY`: primero por HWND; si falla, XX puede ser ya un PID válido (algunas builds).
 * @param {string} sourceId
 * @param {Array<{ hwnd?: unknown, processId?: unknown }>} windows
 * @param {Map<string, unknown>} hwndToPid
 */
function processIdForWindowSource(sourceId, windows, hwndToPid) {
  const xx = xxFromElectronWindowSourceId(sourceId)
  if (xx == null) return undefined
  for (const k of hwndLookupKeys(xx)) {
    const pid = hwndToPid.get(k)
    if (pid !== undefined && pid !== null && String(pid).length > 0) {
      return String(pid)
    }
  }
  const asNum = Number.parseInt(xx, 10)
  if (!Number.isNaN(asNum) && asNum > 0) {
    const asPid = String(asNum)
    const ok = windows.some((w) => String(w.processId) === asPid || w.processId === asNum)
    if (ok) return asPid
  }
  return undefined
}

/**
 * Cruza `desktopCapturer` con ProcessList.exe (HWND → PID).
 * @param {Array<{ id: string, name: string, display_id?: string, thumbnailDataUrl: string, sourceType: 'window' | 'screen' }>} rows
 */
async function enrichSourcesWithProcessId(rows) {
  const al = getLoopback()
  if (!al) return rows
  let windows = []
  try {
    windows = await al.getActiveWindowProcessIds()
  } catch (e) {
    console.warn('[electron] getActiveWindowProcessIds falló', e)
    return rows
  }

  const hwndToPid = new Map()
  for (const w of windows) {
    const pid = w.processId
    if (pid === undefined || pid === null) continue
    for (const k of hwndLookupKeys(String(w.hwnd ?? ''))) {
      hwndToPid.set(k, pid)
    }
  }

  return rows.map((s) => {
    if (s.sourceType !== 'window') return { ...s, processId: undefined }
    const pid = processIdForWindowSource(s.id, windows, hwndToPid)
    return { ...s, processId: pid ?? undefined }
  })
}

/** @type {Map<number, string>} webContents.id → PID capturado */
const capturePidByWebContents = new Map()

/**
 * Agrupa PCM antes de IPC (equilibrio mensajes V8 vs suavidad en el renderer).
 * El exe `application-loopback` emite **stereo s16 @ 48 kHz** (4 bytes / frame).
 * ~20 ms = 48000 * 0.02 * 4 = 3840 bytes.
 */
const LOOPBACK_IPC_BATCH_BYTES = 3840
const LOOPBACK_IPC_FLUSH_MS = 20

/** @type {Map<number, { buf: Buffer, timer: ReturnType<typeof setTimeout> | null }>} */
const ipcLoopbackAccumByWcId = new Map()

/**
 * @param {import('electron').WebContents} wc
 * @param {{ buf: Buffer, timer: ReturnType<typeof setTimeout> | null }} state
 * @param {boolean} forceAll enviar todo lo pendiente (p. ej. al parar captura)
 */
function flushLoopbackIpcBuffer(wc, state, forceAll) {
  if (wc.isDestroyed()) return
  if (forceAll) {
    while (state.buf.length > 0) {
      const take = state.buf.length
      const payload = Buffer.from(state.buf.subarray(0, take))
      state.buf = state.buf.subarray(take)
      wc.send('electron:app-loopback-chunk', payload)
    }
    return
  }
  while (state.buf.length >= LOOPBACK_IPC_BATCH_BYTES) {
    const payload = Buffer.from(state.buf.subarray(0, LOOPBACK_IPC_BATCH_BYTES))
    state.buf = state.buf.subarray(LOOPBACK_IPC_BATCH_BYTES)
    wc.send('electron:app-loopback-chunk', payload)
  }
}

/**
 * @param {import('electron').WebContents} wc
 * @param {{ buf: Buffer, timer: ReturnType<typeof setTimeout> | null }} state
 */
function scheduleLoopbackIpcFlush(wc, state) {
  if (state.timer != null) return
  state.timer = setTimeout(() => {
    state.timer = null
    if (wc.isDestroyed()) return
    const st = ipcLoopbackAccumByWcId.get(wc.id)
    if (!st || st.buf.length === 0) return
    flushLoopbackIpcBuffer(wc, st, true)
  }, LOOPBACK_IPC_FLUSH_MS)
}

/**
 * @param {import('electron').IpcMain} ipcMain
 */
function registerAppLoopbackIpc(ipcMain) {
  ipcMain.handle('electron:start-app-loopback', (event, processId) => {
    const al = getLoopback()
    if (!al) return { ok: false, reason: 'wasapi_module_unavailable' }
    const pid = String(processId ?? '').trim()
    if (!pid) return { ok: false, reason: 'missing_pid' }

    const wc = event.sender
    stopAppLoopbackForWebContents(wc)

    const accumState = { buf: Buffer.alloc(0), timer: null }
    ipcLoopbackAccumByWcId.set(wc.id, accumState)

    try {
      al.startAudioCapture(pid, {
        onData: (chunk) => {
          if (wc.isDestroyed()) return
          const u8 = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk)
          const copy = Buffer.from(u8)
          const state = ipcLoopbackAccumByWcId.get(wc.id)
          if (!state) return
          state.buf = state.buf.length === 0 ? copy : Buffer.concat([state.buf, copy])
          flushLoopbackIpcBuffer(wc, state, false)
          scheduleLoopbackIpcFlush(wc, state)
        },
      })
    } catch (e) {
      return { ok: false, reason: String(e) }
    }
    capturePidByWebContents.set(wc.id, pid)
    return {
      ok: true,
      sampleRate: WASAPI_LOOPBACK_SAMPLE_RATE_HZ,
      channels: WASAPI_LOOPBACK_CHANNELS,
    }
  })

  ipcMain.handle('electron:stop-app-loopback', (event) => {
    stopAppLoopbackForWebContents(event.sender)
    return true
  })
}

/** @param {import('electron').WebContents} wc */
function stopAppLoopbackForWebContents(wc) {
  const pid = capturePidByWebContents.get(wc.id)
  if (!pid) {
    const orphan = ipcLoopbackAccumByWcId.get(wc.id)
    if (orphan?.timer != null) clearTimeout(orphan.timer)
    ipcLoopbackAccumByWcId.delete(wc.id)
    return
  }
  const al = getLoopback()
  if (al) {
    try {
      al.stopAudioCapture(pid)
    } catch {
      /* noop */
    }
  }
  capturePidByWebContents.delete(wc.id)

  const accum = ipcLoopbackAccumByWcId.get(wc.id)
  if (accum?.timer != null) {
    clearTimeout(accum.timer)
    accum.timer = null
  }
  if (accum && accum.buf.length > 0 && !wc.isDestroyed()) {
    flushLoopbackIpcBuffer(wc, accum, true)
  }
  ipcLoopbackAccumByWcId.delete(wc.id)
}

module.exports = {
  getLoopback,
  enrichSourcesWithProcessId,
  registerAppLoopbackIpc,
  stopAppLoopbackForWebContents,
}
