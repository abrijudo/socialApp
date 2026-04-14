import { useEffect, useState } from 'react'
import { useTracks } from '@livekit/components-react'
import { Track } from 'livekit-client'
import { PanelBottom, PanelTop } from 'lucide-react'
import { ChatArea } from '@/components/chat/ChatArea'
import { ChannelHeader } from '@/components/layout/MainChatColumn'
import { UserProfilePopup } from '@/components/modals/UserProfilePopup'
import { VideoStage } from '@/components/voice/VideoStage'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/store/useAppStore'

/**
 * Main con escenario de vídeo opcional. Solo como hijo de LiveKitRoom.
 * Módulo separado para code-splitting (LiveKit fuera del bundle inicial).
 */
export function MainChatColumnLive() {
  const activeTextChannelId = useAppStore((s) => s.activeTextChannelId)
  const activeVoiceChannelId = useAppStore((s) => s.activeVoiceChannelId)
  const isVideoStageOpen = useAppStore((s) => s.isVideoStageOpen)
  const setIsVideoStageOpen = useAppStore((s) => s.setIsVideoStageOpen)
  const channels = useAppStore((s) => s.channels)
  const activeChannel = channels.find((c) => c.id === activeTextChannelId)
  const videoTracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: false },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  )
  const hasAnyVideo = videoTracks.length > 0

  const [profileUserId, setProfileUserId] = useState<string | null>(null)
  const split = Boolean(activeVoiceChannelId) && isVideoStageOpen
  const inVoice = Boolean(activeVoiceChannelId)

  useEffect(() => {
    if (!inVoice) return
    if (!hasAnyVideo && isVideoStageOpen) {
      setIsVideoStageOpen(false)
    }
  }, [hasAnyVideo, inVoice, isVideoStageOpen, setIsVideoStageOpen])

  return (
    <main
      className="bg-background flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
      aria-label="Contenido principal"
    >
      <ChannelHeader activeChannel={activeChannel} />
      {inVoice && !isVideoStageOpen && hasAnyVideo ? (
        <div className="border-border flex shrink-0 items-center justify-end gap-2 border-b px-2 py-1.5 sm:px-4">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs"
            onClick={() => setIsVideoStageOpen(true)}
          >
            <PanelTop className="size-3.5" aria-hidden />
            Mostrar panel de vídeo
          </Button>
        </div>
      ) : null}
      {split ? (
        <>
          <div className="border-border flex shrink-0 items-center justify-end gap-2 border-b px-2 py-1 sm:px-4">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground gap-1.5 text-xs"
              onClick={() => setIsVideoStageOpen(false)}
            >
              <PanelBottom className="size-3.5" aria-hidden />
              Ocultar videos
            </Button>
          </div>
          <div className="border-border flex h-[min(42vh,400px)] min-h-[168px] w-full min-w-0 shrink-0 flex-col overflow-hidden border-b p-2 md:h-[min(46vh,440px)] md:min-h-[200px]">
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <VideoStage />
            </div>
          </div>
          <div className="flex min-h-0 min-w-0 w-full flex-1 flex-col">
            <ChatArea channelId={activeTextChannelId} onAuthorClick={setProfileUserId} />
          </div>
        </>
      ) : (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <ChatArea channelId={activeTextChannelId} onAuthorClick={setProfileUserId} />
        </div>
      )}
      {profileUserId ? (
        <UserProfilePopup
          open
          onOpenChange={(open) => { if (!open) setProfileUserId(null) }}
          userId={profileUserId}
        />
      ) : null}
    </main>
  )
}
