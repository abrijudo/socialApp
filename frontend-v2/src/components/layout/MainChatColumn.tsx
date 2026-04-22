import { useMemo, useState } from 'react'
import { Hash, Menu, PanelTop, Users } from 'lucide-react'
import { ChatArea } from '@/components/chat/ChatArea'
import { DmChatArea } from '@/components/chat/DmChatArea'
import { HomeMainEmpty } from '@/components/layout/HomeMainEmpty'
import { useMobileNav } from '@/components/layout/MobileNavContext'
import { UserProfilePopup } from '@/components/modals/UserProfilePopup'
import { Button } from '@/components/ui/button'
import { LUX_ICON_STROKE, luxIconHeader, luxIconRow } from '@/lib/luxIcon'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store/useAppStore'
import type { Channel } from '@/types/models'

export function ChannelHeader({ activeChannel }: { activeChannel: Channel | undefined }) {
  const mobile = useMobileNav()

  return (
    <header className="lux-glass-header gap-2 sm:px-4">
      {mobile ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="lux-icon-button md:hidden shrink-0"
          aria-label="Abrir menú de navegación"
          onClick={() => mobile.openNavSheet()}
        >
          <Menu className={cn(luxIconHeader)} strokeWidth={LUX_ICON_STROKE} aria-hidden />
        </Button>
      ) : null}
      <span className="text-foreground/90 min-w-0 flex-1 truncate text-[0.75rem] font-medium tracking-tight sm:text-[0.78rem]">
        {activeChannel ? (
          <>
            <Hash
              className="lux-icon mr-1.5 inline size-4 align-text-bottom text-muted-foreground/85"
              strokeWidth={LUX_ICON_STROKE}
              aria-hidden
            />
            {activeChannel.name}
          </>
        ) : (
          <span className="text-muted-foreground font-medium">Sin canal seleccionado</span>
        )}
      </span>
      {mobile?.showMembersButton ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="lux-icon-button lg:hidden shrink-0"
          aria-label="Abrir lista de miembros"
          onClick={() => mobile.openMembersSheet()}
        >
          <Users className={cn(luxIconHeader)} strokeWidth={LUX_ICON_STROKE} aria-hidden />
        </Button>
      ) : null}
    </header>
  )
}

/**
 * Columna central única: mensajes, cabecera y (en voz) cinta para abrir el panel de vídeo.
 * No se desmonta al conectar LiveKit: el contenedor y `ChatArea` permanecen en el árbol.
 */
export function MainChatColumn() {
  const activeTextChannelId = useAppStore((s) => s.activeTextChannelId)
  const activeDmChannelId = useAppStore((s) => s.activeDmChannelId)
  const activeServerId = useAppStore((s) => s.activeServerId)
  const activeVoiceChannelId = useAppStore((s) => s.activeVoiceChannelId)
  const isVideoStageOpen = useAppStore((s) => s.isVideoStageOpen)
  const setIsVideoStageOpen = useAppStore((s) => s.setIsVideoStageOpen)
  const voiceRoomHasRenderableVideo = useAppStore((s) => s.voiceRoomHasRenderableVideo)
  const channels = useAppStore((s) => s.channels)
  const activeChannel = channels.find((c) => c.id === activeTextChannelId)

  const voiceChannel = useMemo(
    () => (activeVoiceChannelId ? channels.find((c) => c.id === activeVoiceChannelId) : undefined),
    [activeVoiceChannelId, channels],
  )
  const inDm = Boolean(activeDmChannelId)
  const inOtherServer =
    activeServerId != null &&
    voiceChannel?.server_id != null &&
    activeServerId !== voiceChannel.server_id
  const atInbox = !activeServerId && !activeDmChannelId
  const isFloatingMode = inDm || inOtherServer || atInbox
  const inVoice = Boolean(activeVoiceChannelId)

  const [profileUserId, setProfileUserId] = useState<string | null>(null)

  return (
    <div
      className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background/80"
      data-main-chat-column
    >
      {!isFloatingMode ? <ChannelHeader activeChannel={activeChannel} /> : null}

      {!isFloatingMode && inVoice && !isVideoStageOpen && voiceRoomHasRenderableVideo ? (
        <div className="flex h-12 shrink-0 items-center justify-end gap-2 border-b border-white/[0.05] bg-foreground/[0.02] px-3 sm:px-4 [box-shadow:inset_0_-1px_0_0_rgba(0,0,0,0.12)]">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs"
            onClick={() => setIsVideoStageOpen(true)}
          >
            <PanelTop className={cn(luxIconRow, 'size-3.5')} strokeWidth={LUX_ICON_STROKE} aria-hidden />{' '}
            Mostrar panel de vídeo
          </Button>
        </div>
      ) : null}

      <div className="flex min-h-0 min-w-0 w-full flex-1 flex-col">
        {activeDmChannelId ? (
          <DmChatArea dmChannelId={activeDmChannelId} />
        ) : !activeTextChannelId && !activeServerId ? (
          <HomeMainEmpty />
        ) : (
          <ChatArea channelId={activeTextChannelId} onAuthorClick={setProfileUserId} />
        )}
      </div>

      {profileUserId ? (
        <UserProfilePopup
          open
          onOpenChange={(open) => {
            if (!open) setProfileUserId(null)
          }}
          userId={profileUserId}
        />
      ) : null}
    </div>
  )
}
