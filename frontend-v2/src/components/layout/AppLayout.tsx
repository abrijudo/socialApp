import type { ReactNode } from 'react'
import { lazy, Suspense } from 'react'
import { Loader2, Menu, MessageCircle } from 'lucide-react'
import { DmChatArea } from '@/components/chat/DmChatArea'
import { DmSidebar } from '@/components/layout/DmSidebar'
import { MainChatColumnPlain } from '@/components/layout/MainChatColumn'
import { MembersList } from '@/components/layout/MembersList'
import { MobileNavProvider, useMobileNav } from '@/components/layout/MobileNavContext'
import { ServerRail } from '@/components/layout/ServerRail'
import { ServerSidebar } from '@/components/layout/ServerSidebar'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { useChannelDeletedRealtime } from '@/hooks/useChannelDeletedRealtime'
import { useServerPresence } from '@/hooks/useServerPresence'
import { useVoicePresence } from '@/hooks/useVoicePresence'
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

function HomeMainEmpty() {
  const mobile = useMobileNav()

  return (
    <main
      className="bg-background flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
      aria-label="Inicio"
    >
      <header className="border-border flex h-12 shrink-0 items-center gap-2 border-b px-3 shadow-sm">
        {mobile ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="md:hidden shrink-0"
            aria-label="Abrir menú de navegación"
            onClick={() => mobile.openNavSheet()}
          >
            <Menu className="size-5" aria-hidden />
          </Button>
        ) : null}
        <span className="text-muted-foreground text-sm font-semibold">Inicio</span>
      </header>
      <div className="text-muted-foreground flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto p-3 text-center text-sm">
        <div className="bg-muted mb-4 flex size-16 shrink-0 items-center justify-center rounded-[20px]">
          <MessageCircle className="text-muted-foreground size-8" aria-hidden />
        </div>
        <p className="max-w-sm leading-relaxed">
          Elige una conversación en Mensajes directos o vuelve a un servidor.
        </p>
      </div>
    </main>
  )
}

function MobileSheets({
  activeServerId,
  activeVoiceChannelId,
  servers,
  onHome,
  onSelectServer,
}: {
  activeServerId: string | null
  activeVoiceChannelId: string | null
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
    activeVoiceChannelId || activeServerId ? (
      <ServerSidebar voicePanel={null} />
    ) : (
      <DmSidebar />
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
  const activeDmChannelId = useAppStore((s) => s.activeDmChannelId)
  const setActiveServerId = useAppStore((s) => s.setActiveServerId)
  const setActiveTextChannelId = useAppStore((s) => s.setActiveTextChannelId)
  const setActiveVoiceChannelId = useAppStore((s) => s.setActiveVoiceChannelId)
  const activeVoiceChannel = channels.find((c) => c.id === activeVoiceChannelId)

  useServerPresence(activeServerId, userId)
  useVoicePresence({ subscribe: true })
  useChannelDeletedRealtime(activeServerId)

  function goHome() {
    setActiveVoiceChannelId(null)
    setActiveServerId(null)
    setActiveTextChannelId(null)
  }

  function selectServer(srvId: string) {
    setActiveVoiceChannelId(null)
    setActiveServerId(srvId)
    const firstText = channels.find(
      (c) => c.server_id === srvId && c.type === 'text' && !c.is_archived,
    )
    setActiveTextChannelId(firstText?.id ?? null)
  }

  const mainWhenNotVoice: ReactNode = activeServerId ? (
    <MainChatColumnPlain />
  ) : activeDmChannelId ? (
    <DmChatArea dmChannelId={activeDmChannelId} />
  ) : (
    <HomeMainEmpty />
  )

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
                  renderNav={(voicePanel) => <ServerSidebar voicePanel={voicePanel} />}
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
        activeVoiceChannelId={activeVoiceChannelId}
        servers={servers}
        onHome={goHome}
        onSelectServer={selectServer}
      />
    </MobileNavProvider>
  )
}
