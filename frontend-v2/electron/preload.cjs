const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
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
})
