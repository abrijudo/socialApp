import { createContext, useContext, type ReactNode } from 'react'

export type VoiceConnectionState = {
  /** Token LiveKit listo y `LiveKitRoom` montado. */
  liveKitReady: boolean
  isLoading: boolean
  error: string | null
}

const defaultVoiceConnection: VoiceConnectionState = {
  liveKitReady: false,
  isLoading: false,
  error: null,
}

const VoiceConnectionContext = createContext<VoiceConnectionState>(defaultVoiceConnection)

export function VoiceConnectionProvider({
  value,
  children,
}: {
  value: VoiceConnectionState
  children: ReactNode
}) {
  return <VoiceConnectionContext.Provider value={value}>{children}</VoiceConnectionContext.Provider>
}

export function useVoiceConnection(): VoiceConnectionState {
  return useContext(VoiceConnectionContext)
}
