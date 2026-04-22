import { useEffect, type ReactNode } from 'react'
import { LiveKitRoom, RoomAudioRenderer, useRoomContext } from '@livekit/components-react'
import '@livekit/components-styles'
import { MembersList } from '@/components/layout/MembersList'
import { ServerRail } from '@/components/layout/ServerRail'
import { UserAccountFooter } from '@/components/layout/UserAccountFooter'
import { VoiceControlBar } from '@/components/voice/VoiceControlBar'
import { roomOptionsHighQuality } from '@/components/voice/voiceQuality'
import { useVoiceChannelSoundEffects } from '@/hooks/useVoiceChannelSoundEffects'
import { useLiveKitSpeakers } from '@/hooks/useLiveKitSpeakers'
import { useMatchMedia } from '@/hooks/useMatchMedia'
import { cn } from '@/lib/utils'
import type { Server } from '@/types/models'

export type VoiceSessionLiveKitProps = {
  token: string
  serverUrl: string
  channelName?: string
  servers: Server[]
  activeServerId: string | null
  onHome: () => void
  onSelectServer: (id: string) => void
  renderNav: () => ReactNode
  renderMainConnected: () => ReactNode
}

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

function VoiceStatusChrome({
  channelName,
  children,
}: {
  channelName?: string
  children: ReactNode
}) {
  return (
    <div className="border-border/60 bg-muted/80 flex shrink-0 flex-col gap-2 border-t p-3 backdrop-blur-sm">
      <div className="min-w-0">
        <p className="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase">
          Conectado a voz
        </p>
        {channelName ? (
          <p className="text-foreground mt-0.5 truncate text-sm font-medium" title={channelName}>
            #{channelName}
          </p>
        ) : null}
      </div>
      {children}
    </div>
  )
}

/**
 * Árbol conectado a LiveKit: solo se importa (chunk pesado) cuando hay token y URL.
 */
export function VoiceSessionLiveKit({
  token,
  serverUrl,
  channelName,
  servers,
  activeServerId,
  onHome,
  onSelectServer,
  renderNav,
  renderMainConnected,
}: VoiceSessionLiveKitProps) {
  const mdUp = useMatchMedia('(min-width: 768px)')
  const roomOptions = roomOptionsHighQuality

  const voicePanelConnected = (
    <VoiceStatusChrome channelName={channelName}>
      <VoiceControlBar />
    </VoiceStatusChrome>
  )

  const rail = (
    <ServerRail
      activeServerId={activeServerId}
      servers={servers}
      onHome={onHome}
      onSelectServer={onSelectServer}
      className="hidden h-full min-h-0 md:flex"
    />
  )

  return (
    <LiveKitRoom
      token={token}
      serverUrl={serverUrl}
      connect={true}
      audio={true}
      video={false}
      options={roomOptions}
      className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
    >
      <RoomAudioRenderer />
      <LiveKitSpeakerSync />
      <VoiceChannelSoundEffectsSync />
      <LiveKitPageUnloadCleanup />
      <div className="flex h-full min-h-0 min-w-0 flex-1 flex-row overflow-hidden">
        {rail}
        <div className="hidden h-full min-h-0 w-[240px] shrink-0 flex-col overflow-hidden border-r border-border bg-muted md:flex">
          <div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
            <div className="min-h-0 flex-1 overflow-hidden">{renderNav()}</div>
            <div className="shrink-0">{voicePanelConnected}</div>
            <UserAccountFooter />
          </div>
        </div>
        <div
          className={cn(
            'bg-background flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden',
            !mdUp &&
              'pb-[max(4.75rem,calc(env(safe-area-inset-bottom,0px)+3.5rem))]',
          )}
        >
          {renderMainConnected()}
        </div>
        <div className="hidden h-full min-h-0 w-[240px] shrink-0 flex-col overflow-hidden border-l border-border bg-muted lg:flex">
          <MembersList className="h-full min-h-0 w-full border-0 bg-transparent" />
        </div>
      </div>
      {!mdUp ? (
        <div className="border-border/60 bg-muted/80 supports-backdrop-filter:backdrop-blur-sm fixed right-0 bottom-0 left-0 z-[190] border-t p-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] md:hidden">
          <VoiceControlBar />
        </div>
      ) : null}
    </LiveKitRoom>
  )
}
