const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  /** `darwin` | `win32` | `linux` — para ajustar barra de título. */
  platform: process.platform,

  windowMin: () => ipcRenderer.send('electron:window-min'),
  windowMax: () => ipcRenderer.send('electron:window-max'),
  windowClose: () => ipcRenderer.send('electron:window-close'),
  windowIsMaximized: () => ipcRenderer.invoke('electron:window-is-maximized'),
  onWindowState: (callback) => {
    const fn = (_event, state) => {
      callback?.(state ?? {})
    }
    ipcRenderer.on('electron:window-state', fn)
    return () => {
      ipcRenderer.removeListener('electron:window-state', fn)
    }
  },
  /**
   * @param {{ types?: ('window' | 'screen')[], thumbnailSize?: { width: number, height: number } }} [options]
   */
  getDesktopSources: (options) => ipcRenderer.invoke('electron:get-desktop-sources', options ?? {}),
  /**
   * Debe llamarse justo antes de `getDisplayMedia`; el proceso principal concede esa fuente en
   * `setDisplayMediaRequestHandler`.
   * @param {{ sourceId: string, wantLoopbackAudio?: boolean }} payload
   */
  armDisplayMediaPick: (payload) => ipcRenderer.invoke('electron:arm-display-media-pick', payload),
  cancelDisplayMediaPick: () => ipcRenderer.invoke('electron:cancel-display-media-pick'),
  startAppLoopbackAudio: (processId) => ipcRenderer.invoke('electron:start-app-loopback', processId),
  stopAppLoopbackAudio: () => ipcRenderer.invoke('electron:stop-app-loopback'),
  /**
   * @param {(pcm: Uint8Array) => void} callback
   * @returns {() => void} función para dejar de escuchar
   */
  onAppLoopbackChunk: (callback) => {
    const listener = (_event, buf) => {
      const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
      callback(u8)
    }
    ipcRenderer.on('electron:app-loopback-chunk', listener)
    return () => ipcRenderer.removeListener('electron:app-loopback-chunk', listener)
  },

  onUpdateAvailable: (callback) => {
    const listener = (_event, version) => {
      callback(typeof version === 'string' ? version : String(version ?? ''))
    }
    ipcRenderer.on('electron:update-available', listener)
    return () => ipcRenderer.removeListener('electron:update-available', listener)
  },
  onUpdateReady: (callback) => {
    const listener = () => {
      callback()
    }
    ipcRenderer.on('electron:update-ready', listener)
    return () => ipcRenderer.removeListener('electron:update-ready', listener)
  },
  onUpdateDownloadProgress: (callback) => {
    const listener = (_event, progress) => {
      callback(progress ?? {})
    }
    ipcRenderer.on('electron:update-download-progress', listener)
    return () => ipcRenderer.removeListener('electron:update-download-progress', listener)
  },
  startUpdateDownload: () => {
    ipcRenderer.send('electron:start-update-download')
  },
  installUpdate: () => {
    ipcRenderer.send('electron:install-update')
  },
})
