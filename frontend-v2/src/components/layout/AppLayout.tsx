import { useCallback, useMemo, type ReactNode } from 'react'
import { DmSidebar } from '@/components/layout/DmSidebar'
import { MainChatColumn } from '@/components/layout/MainChatColumn'
import { MembersList } from '@/components/layout/MembersList'
import { MobileNavProvider, useMobileNav } from '@/components/layout/MobileNavContext'
import { ServerRail } from '@/components/layout/ServerRail'
import { ServerSidebar } from '@/components/layout/ServerSidebar'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { VideoStageHost } from '@/components/voice/VideoStageHost'
import { VoiceSession } from '@/components/voice/VoiceRoom'
import { useChannelMessages, useGlobalMessagesRealtime } from '@/hooks/useChannelMessages'
import { useDmMessages, useGlobalDmMessagesRealtime } from '@/hooks/useDmMessages'
import { useGlobalFriendsRealtime } from '@/hooks/useGlobalFriendsRealtime'
import { useServerPresence } from '@/hooks/useServerPresence'
import { useVoicePresence } from '@/hooks/useVoicePresence'
import { useWorkspaceRealtime } from '@/hooks/useWorkspaceRealtime'
import { useAppStore } from '@/store/useAppStore'
import type { Server } from '@/types/models'
import { cn } from '@/lib/utils'

function MobileSheets({
  activeServerId,
  servers,
  onHome,
  onSelectServer,
}: {
  activeServerId: string | null
  servers: Server[]
  onHome: () => void
  onSelectServer: (id: string) => void
}) {
  const mobile = useMobileNav()
  if (!mobile) return null

  const { navSheetOpen, setNavSheetOpen, membersSheetOpen, setMembersSheetOpen, showMembersButton } = mobile
  const secondColumn = activeServerId ? <ServerSidebar /> : <DmSidebar />

  return (
    <>
      <Sheet open={navSheetOpen} onOpenChange={setNavSheetOpen}>
        <SheetContent
          side="left"
          className="flex h-[100dvh] max-h-[100dvh] min-h-0 w-[312px] max-w-[100vw] flex-col gap-0 border-border/80 bg-popover/95 p-0 backdrop-blur-md"
          onOverlayPointerDown={() => setNavSheetOpen(false)}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <SheetTitle className="sr-only">Navegación</SheetTitle>
          <div className="flex h-full min-h-0 w-full flex-1 flex-row overflow-hidden">
            <ServerRail
              activeServerId={activeServerId}
              servers={servers}
              onHome={onHome}
              onSelectServer={onSelectServer}
              className="h-full min-h-0 shrink-0"
            />
            <div className="lux-panel lux-panel--sep-l flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
              {secondColumn}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {showMembersButton ? (
        <Sheet open={membersSheetOpen} onOpenChange={setMembersSheetOpen}>
          <SheetContent
            side="right"
            className="lux-panel lux-panel--sep-l flex h-[100dvh] max-h-[100dvh] min-h-0 w-[240px] max-w-[100vw] flex-col gap-0 p-0"
            onOverlayPointerDown={() => setMembersSheetOpen(false)}
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            <SheetTitle className="sr-only">Miembros del servidor</SheetTitle>
            <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
              <MembersList className="h-full min-h-0 w-full min-w-0 flex-1 border-0 bg-transparent" />
            </div>
          </SheetContent>
        </Sheet>
      ) : null}
    </>
  )
}

type AppLayoutRowProps = {
  main: ReactNode
  /** Padding inferior móvil por barra fija de voz (unido a canal; barra móvil al conectar). */
  mainMobilePadVoice: boolean
  activeServerId: string | null
  servers: Server[]
  onHome: () => void
  onSelectServer: (id: string) => void
}

function AppLayoutRow({
  main,
  mainMobilePadVoice,
  activeServerId,
  servers,
  onHome,
  onSelectServer,
}: AppLayoutRowProps) {
  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-row overflow-hidden">
      <ServerRail
        activeServerId={activeServerId}
        servers={servers}
        onHome={onHome}
        onSelectServer={onSelectServer}
        className="hidden h-full min-h-0 md:flex"
      />
      <div className="lux-panel lux-panel--sep-r hidden h-full min-h-0 w-[240px] shrink-0 flex-col overflow-hidden md:flex">
        {activeServerId ? <ServerSidebar /> : <DmSidebar />}
      </div>

      <div
        className={cn(
          'lux-main-column text-foreground flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden',
          mainMobilePadVoice &&
            'pb-[max(4.75rem,calc(env(safe-area-inset-bottom,0px)+3.5rem))] md:pb-0',
        )}
      >
        {main}
      </div>

      {activeServerId ? (
        <div className="lux-panel lux-panel--sep-l hidden h-full min-h-0 w-[240px] shrink-0 flex-col overflow-hidden lg:flex">
          <MembersList className="h-full min-h-0 w-full min-w-0 border-0 bg-transparent" />
        </div>
      ) : null}
    </div>
  )
}

export function AppLayout() {
  const servers = useAppStore((s) => s.servers)
  const channels = useAppStore((s) => s.channels)
  const activeServerId = useAppStore((s) => s.activeServerId)
  const userId = useAppStore((s) => s.userId)
  const activeVoiceChannelId = useAppStore((s) => s.activeVoiceChannelId)
  const activeTextChannelId = useAppStore((s) => s.activeTextChannelId)
  const activeDmChannelId = useAppStore((s) => s.activeDmChannelId)
  const setActiveServerId = useAppStore((s) => s.setActiveServerId)
  const setActiveTextChannelId = useAppStore((s) => s.setActiveTextChannelId)

  const activeVoiceChannel = useMemo(
    () => (activeVoiceChannelId ? channels.find((c) => c.id === activeVoiceChannelId) : undefined),
    [channels, activeVoiceChannelId],
  )

  useServerPresence(activeServerId, userId)
  useVoicePresence({ subscribe: true })
  useWorkspaceRealtime()
  useGlobalMessagesRealtime()
  useGlobalDmMessagesRealtime()
  useGlobalFriendsRealtime()
  useChannelMessages(activeTextChannelId)
  useDmMessages(activeDmChannelId)

  const goHome = useCallback(() => {
    setActiveServerId(null)
    setActiveTextChannelId(null)
  }, [setActiveServerId, setActiveTextChannelId])

  const selectServer = useCallback(
    (srvId: string) => {
      setActiveServerId(srvId)
      const currentChannels = useAppStore.getState().channels
      const firstText = currentChannels.find(
        (c) => c.server_id === srvId && c.type === 'text' && !c.is_archived,
      )
      setActiveTextChannelId(firstText?.id ?? null)
    },
    [setActiveServerId, setActiveTextChannelId],
  )

  const showMembersButton = Boolean(activeServerId || activeVoiceChannelId)
  const inVoice = Boolean(activeVoiceChannelId && activeVoiceChannel)
  const mainMobilePad = inVoice

  const mainInVoice: ReactNode = (
    <VideoStageHost voiceChannelServerId={activeVoiceChannel?.server_id}>
      <MainChatColumn />
    </VideoStageHost>
  )

  return (
    <MobileNavProvider showMembersButton={showMembersButton}>
      <div className="relative isolate box-border flex h-[100dvh] max-h-[100dvh] min-h-0 w-full flex-col overflow-hidden bg-background text-foreground pt-safe pb-safe">
        <div className="lux-app-bg" aria-hidden />
        <div className="lux-grain" aria-hidden />
        <div className="lux-app-stack box-border flex min-h-0 flex-1 flex-col overflow-hidden">
        {inVoice && activeVoiceChannelId && activeVoiceChannel ? (
          <VoiceSession channelId={activeVoiceChannelId}>
            <AppLayoutRow
              main={mainInVoice}
              mainMobilePadVoice={mainMobilePad}
              activeServerId={activeServerId}
              servers={servers}
              onHome={goHome}
              onSelectServer={selectServer}
            />
          </VoiceSession>
        ) : (
          <AppLayoutRow
            main={<MainChatColumn />}
            mainMobilePadVoice={false}
            activeServerId={activeServerId}
            servers={servers}
            onHome={goHome}
            onSelectServer={selectServer}
          />
        )}
        </div>
      </div>

      <MobileSheets
        activeServerId={activeServerId}
        servers={servers}
        onHome={goHome}
        onSelectServer={selectServer}
      />
    </MobileNavProvider>
  )
}
