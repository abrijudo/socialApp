export interface ElectronDesktopSourceInfo {
  id: string
  name: string
  display_id?: string
  thumbnailDataUrl: string
  sourceType: 'window' | 'screen'
  /** PID Windows (solo ventanas; Main cruza HWND vía ProcessList + application-loopback). */
  processId?: string
}

export interface ElectronAPI {
  getDesktopSources: (options?: {
    types?: ('window' | 'screen')[]
    thumbnailSize?: { width: number; height: number }
  }) => Promise<ElectronDesktopSourceInfo[]>
  armDisplayMediaPick: (payload: {
    sourceId: string
    wantLoopbackAudio?: boolean
  }) => Promise<boolean>
  cancelDisplayMediaPick: () => Promise<boolean>
  startAppLoopbackAudio: (processId: string) => Promise<
    | { ok: true; sampleRate: number; channels: number }
    | { ok: false; reason?: string }
  >
  stopAppLoopbackAudio: () => Promise<boolean>
  /** Registra callback PCM; devuelve función para desuscribirse. */
  onAppLoopbackChunk: (callback: (pcm: Uint8Array) => void) => () => void
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}

export {}
