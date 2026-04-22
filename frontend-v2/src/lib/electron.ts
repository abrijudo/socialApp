export function isElectronRuntime(): boolean {
  return typeof window !== 'undefined' && typeof window.electronAPI?.getDesktopSources === 'function'
}

/** Ventana con preload (Electron); en el navegador no hay `window.electronAPI`. */
export function isElectronAppShell(): boolean {
  return typeof window !== 'undefined' && window.electronAPI != null
}
