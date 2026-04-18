export interface ElectronDesktopSourceInfo {
  id: string
  name: string
  display_id?: string
  thumbnailDataUrl: string
  sourceType: 'window' | 'screen'
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
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}

export {}
