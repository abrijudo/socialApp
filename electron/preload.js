const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopApp', {
  isElectron: true,
  platform: process.platform,
  listCaptureSources: async () => {
    const rows = await ipcRenderer.invoke('desktop:list-capture-sources');
    return Array.isArray(rows) ? rows : [];
  },
  setCaptureSource: async (sourceId) => {
    return ipcRenderer.invoke('desktop:set-capture-source', sourceId);
  },
});
