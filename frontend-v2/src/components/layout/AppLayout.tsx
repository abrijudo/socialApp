import type { ReactNode } from 'react'
import { lazy, Suspense, useCallback, useMemo } from 'react'
import { Loader2 } from 'lucide-react'
import { DmChatArea } from '@/components/chat/DmChatArea'
import { DmSidebar } from '@/components/layout/DmSidebar'
import { HomeMainEmpty } from '@/components/layout/HomeMainEmpty'
import { MainChatColumnPlain } from '@/components/layout/MainChatColumn'
import { MembersList } from '@/components/layout/MembersList'
import { MobileNavProvider, useMobileNav } from '@/components/layout/MobileNavContext'
import { ServerRail } from '@/components/layout/ServerRail'
import { ServerSidebar } from '@/components/layout/ServerSidebar'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { useChannelMessages, useGlobalMessagesRealtime } from '@/hooks/useChannelMessages'
import { useDmMessages, useGlobalDmMessagesRealtime } from '@/hooks/useDmMessages'
import { useServerPresence } from '@/hooks/useServerPresence'
import { useVoicePresence } from '@/hooks/useVoicePresence'
import { useWorkspaceRealtime } from '@/hooks/useWorkspaceRealtime'
import { useAppStore } from '@/store/useAppStore'
import type { Server } from '@/types/models'

const VoiceSession = lazy(() =>
  import('@/components/voice/VoiceRoom').then((m) => ({ default: m.VoiceSession })),
)

const MainChatColumnLive = lazy(() =>
  import('@/components/layout/MainChatColumnLive').then((m) => ({
    default: m.MainChatColumnLive,
  })),
)

function VoiceLoadingFallback() {
  return (
    <div
      className="bg-background text-muted-foreground flex h-full min-h-0 min-w-0 flex-1 flex-col items-center justify-center gap-3 overflow-hidden"
      role="status"
      aria-live="polite"
    >
      <Loader2 className="text-primary size-8 animate-spin" aria-hidden />
      <p className="text-sm">Cargando módulo de voz…</p>
    </div>
  )
}

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

  const {
    navSheetOpen,
    setNavSheetOpen,
    membersSheetOpen,
    setMembersSheetOpen,
    showMembersButton,
  } = mobile

  const secondColumn =
    activeServerId ? (
      <ServerSidebar voicePanel={null} />
    ) : (
      <DmSidebar voicePanel={null} />
    )

  return (
    <>
      <Sheet open={navSheetOpen} onOpenChange={setNavSheetOpen}>
        <SheetContent
          side="left"
          className="flex h-[100dvh] max-h-[100dvh] min-h-0 w-[312px] max-w-[100vw] flex-col gap-0 bg-muted/80 p-0 backdrop-blur-sm"
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
            <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-l border-border bg-muted">
              {secondColumn}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {showMembersButton ? (
        <Sheet open={membersSheetOpen} onOpenChange={setMembersSheetOpen}>
          <SheetContent
            side="right"
            className="flex h-[100dvh] max-h-[100dvh] min-h-0 w-[240px] max-w-[100vw] flex-col gap-0 bg-muted p-0"
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
  // Fetch del historial del chat activo; el tiempo real es global (ver hooks anteriores).
  useChannelMessages(activeTextChannelId)
  useDmMessages(activeDmChannelId)

  const goHome = useCallback(() => {
    setActiveServerId(null)
    setActiveTextChannelId(null)
  }, [setActiveServerId, setActiveTextChannelId])

  const selectServer = useCallback(
    (srvId: string) => {
      setActiveServerId(srvId)
      // Leemos los canales vigentes desde el store para evitar que `selectServer`
      // cambie de identidad cada vez que se actualiza la lista (p. ej. por Realtime).
      const currentChannels = useAppStore.getState().channels
      const firstText = currentChannels.find(
        (c) => c.server_id === srvId && c.type === 'text' && !c.is_archived,
      )
      setActiveTextChannelId(firstText?.id ?? null)
    },
    [setActiveServerId, setActiveTextChannelId],
  )

  const mainWhenNotVoice: ReactNode = useMemo(() => {
    if (activeServerId) return <MainChatColumnPlain />
    if (activeDmChannelId) return <DmChatArea dmChannelId={activeDmChannelId} />
    return <HomeMainEmpty />
  }, [activeServerId, activeDmChannelId])

  const showMembersButton = Boolean(activeServerId || activeVoiceChannelId)

  return (
    <MobileNavProvider showMembersButton={showMembersButton}>
      <div className="bg-background text-foreground box-border flex h-[100dvh] max-h-[100dvh] min-h-0 w-full flex-col overflow-hidden pt-safe pb-safe">
        <div className="flex h-full min-h-0 min-w-0 flex-1 flex-row overflow-hidden">
          {activeVoiceChannelId ? null : (
            <ServerRail
              activeServerId={activeServerId}
              servers={servers}
              onHome={goHome}
              onSelectServer={selectServer}
              className="hidden h-full min-h-0 md:flex"
            />
          )}

          {activeVoiceChannelId ? (
            <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
              <Suspense fallback={<VoiceLoadingFallback />}>
                <VoiceSession
                  channelId={activeVoiceChannelId}
                  channelName={activeVoiceChannel?.name}
                  servers={servers}
                  activeServerId={activeServerId}
                  onHome={goHome}
                  onSelectServer={selectServer}
                  renderNav={() =>
                    activeServerId ? (
                      <ServerSidebar voicePanel={null} embeddedInVoiceSession />
                    ) : (
                      <DmSidebar voicePanel={null} embeddedInVoiceSession />
                    )
                  }
                  renderMainDisconnected={() => <MainChatColumnPlain />}
                  renderMainConnected={() => (
                    <Suspense fallback={<VoiceLoadingFallback />}>
                      <MainChatColumnLive />
                    </Suspense>
                  )}
                />
              </Suspense>
            </div>
          ) : (
            <div className="flex h-full min-h-0 min-w-0 flex-1 flex-row overflow-hidden">
              <div className="hidden h-full min-h-0 w-[240px] shrink-0 flex-col overflow-hidden border-r border-border bg-muted md:flex">
                {activeServerId ? (
                  <ServerSidebar voicePanel={null} />
                ) : (
                  <DmSidebar />
                )}
              </div>

              <div className="bg-background flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                {mainWhenNotVoice}
              </div>

              {activeServerId ? (
                <div className="hidden h-full min-h-0 w-[240px] shrink-0 flex-col overflow-hidden border-l border-border bg-muted lg:flex">
                  <MembersList className="h-full min-h-0 w-full min-w-0 border-0 bg-transparent" />
                </div>
              ) : null}
            </div>
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
