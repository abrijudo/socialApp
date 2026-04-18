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
})
