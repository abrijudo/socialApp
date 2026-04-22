import { useEffect, type ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { LiveKitRoom, RoomAudioRenderer, useRoomContext } from '@livekit/components-react'
import '@livekit/components-styles'
import { VoiceControlBar } from '@/components/voice/VoiceControlBar'
import { VoiceConnectionProvider, useVoiceConnection } from '@/components/voice/voiceConnectionContext'
import { roomOptionsHighQuality } from '@/components/voice/voiceQuality'
import { useLiveKitVoiceToken } from '@/hooks/useLiveKitVoiceToken'
import { useVoiceChannelSoundEffects } from '@/hooks/useVoiceChannelSoundEffects'
import { useLiveKitSpeakers } from '@/hooks/useLiveKitSpeakers'
import { useMatchMedia } from '@/hooks/useMatchMedia'

function LiveKitSpeakerSync() {
  useLiveKitSpeakers()
  return null
}

function VoiceChannelSoundEffectsSync() {
  useVoiceChannelSoundEffects()
  return null
}

function LiveKitPageUnloadCleanup() {
  const room = useRoomContext()
  useEffect(() => {
    const handler = () => room.disconnect()
    window.addEventListener('beforeunload', handler)
    window.addEventListener('pagehide', handler)
    return () => {
      window.removeEventListener('beforeunload', handler)
      window.removeEventListener('pagehide', handler)
    }
  }, [room])
  return null
}

/** Barra fija bajo mientras se obtiene el token o hay error; el sidebar de escritorio evita la duplicación. */
function MobileVoiceStatusStrip() {
  const mdUp = useMatchMedia('(min-width: 768px)')
  const { liveKitReady, isLoading, error } = useVoiceConnection()
  if (mdUp || liveKitReady) return null
  return (
    <div
      className="border-border/60 bg-muted/90 supports-backdrop-filter:backdrop-blur-sm fixed right-0 bottom-0 left-0 z-[200] border-t px-3 py-2.5 text-center text-xs text-muted-foreground md:hidden"
      role="status"
    >
      {error ? (
        <p className="text-destructive leading-snug">{error}</p>
      ) : (
        <div className="flex items-center justify-center gap-2">
          {isLoading ? <Loader2 className="text-primary size-4 shrink-0 animate-spin" aria-hidden /> : null}
          <span>{isLoading ? 'Conectando a voz…' : 'Preparando conexión…'}</span>
        </div>
      )}
    </div>
  )
}

function VoiceSessionRoomChrome({ children }: { children: ReactNode }) {
  const { liveKitReady } = useVoiceConnection()
  const mdUp = useMatchMedia('(min-width: 768px)')
  return (
    <>
      <RoomAudioRenderer />
      <LiveKitSpeakerSync />
      <VoiceChannelSoundEffectsSync />
      <LiveKitPageUnloadCleanup />
      {children}
      {!mdUp && liveKitReady ? (
        <div className="border-border/60 bg-muted/80 supports-backdrop-filter:backdrop-blur-sm fixed right-0 bottom-0 left-0 z-[190] border-t p-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] md:hidden">
          <VoiceControlBar />
        </div>
      ) : null}
    </>
  )
}

export type VoiceSessionProps = {
  channelId: string
  children: ReactNode
}

/**
 * Conexión LiveKit: un único `LiveKitRoom` montado al unirse a voz, con `connect` solo
 * cuando el token está listo — evita reemplazar el layout entero (sin chunk lazy bloqueando).
 */
export function VoiceSession({ channelId, children }: VoiceSessionProps) {
  const { token, serverUrl, error, isLoading } = useLiveKitVoiceToken(channelId)
  const ready = Boolean(token && serverUrl)
  const connectionValue = {
    liveKitReady: ready,
    isLoading,
    error: error ?? null,
  }
  const roomOptions = roomOptionsHighQuality

  return (
    <VoiceConnectionProvider value={connectionValue}>
      <LiveKitRoom
        token={token}
        serverUrl={serverUrl}
        connect={ready}
        audio
        video={false}
        options={roomOptions}
        className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
        onError={(e) => {
          console.warn('[LiveKitRoom]', e)
        }}
      >
        <VoiceSessionRoomChrome>{children}</VoiceSessionRoomChrome>
      </LiveKitRoom>
      <MobileVoiceStatusStrip />
    </VoiceConnectionProvider>
  )
}
