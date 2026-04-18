export function isElectronRuntime(): boolean {
  return typeof window !== 'undefined' && typeof window.electronAPI?.getDesktopSources === 'function'
}
