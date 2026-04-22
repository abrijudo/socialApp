import { lazy, Suspense, type ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { MembersList } from '@/components/layout/MembersList'
import { ServerRail } from '@/components/layout/ServerRail'
import { UserAccountFooter } from '@/components/layout/UserAccountFooter'
import { useLiveKitVoiceToken } from '@/hooks/useLiveKitVoiceToken'
import type { Server } from '@/types/models'

export type VoiceSessionProps = {
  channelId: string
  channelName?: string
  servers: Server[]
  activeServerId: string | null
  onHome: () => void
  onSelectServer: (id: string) => void
  /** Solo contenido scrollable de la columna; voz y footer los fija la sesión debajo para no desmontar `VoiceControlBar`. */
  renderNav: () => ReactNode
  /** Main sin LiveKit (token cargando o error). */
  renderMainDisconnected: () => ReactNode
  /** Main dentro de LiveKit (puede usar useTracks, etc.). */
  renderMainConnected: () => ReactNode
}

/**
 * Segundo nivel de code-splitting: el chunk con `livekit-client` / `@livekit/components-react`
 * solo se pide cuando ya hay token (el usuario ya eligió canal de voz y el API respondió).
 */
const VoiceSessionLiveKitLazy = lazy(async () => {
  const m = await import('@/components/voice/VoiceSessionLiveKit')
  return { default: m.VoiceSessionLiveKit }
})

function LiveKitChunkFallback() {
  return (
    <div className="text-muted-foreground flex h-full min-h-0 min-w-0 flex-1 flex-col items-center justify-center gap-2 px-4 py-8 text-xs">
      <Loader2 className="text-primary size-6 animate-spin shrink-0" aria-hidden />
      <span className="text-center leading-snug">Cargando motor de voz…</span>
    </div>
  )
}

export function VoiceSession({
  channelId,
  channelName,
  servers,
  activeServerId,
  onHome,
  onSelectServer,
  renderNav,
  renderMainDisconnected,
  renderMainConnected,
}: VoiceSessionProps) {
  const { token, serverUrl, error, isLoading } = useLiveKitVoiceToken(channelId)

  const voiceLoadingPanel = (
    <div className="text-muted-foreground flex flex-col items-center gap-2 py-3 text-xs">
      <Loader2 className="text-primary size-6 animate-spin shrink-0" aria-hidden />
      <span className="text-center leading-snug">Conectando a voz…</span>
    </div>
  )

  const voiceErrorPanel = error ? (
    <div className="text-destructive px-2 text-center text-xs leading-snug" role="alert">
      {error}
    </div>
  ) : null

  const ready = Boolean(token && serverUrl)

  const rail = (
    <ServerRail
      activeServerId={activeServerId}
      servers={servers}
      onHome={onHome}
      onSelectServer={onSelectServer}
      className="hidden h-full min-h-0 md:flex"
    />
  )

  if (!ready) {
    const panel = error
      ? voiceErrorPanel
      : isLoading
        ? voiceLoadingPanel
        : (
            <p className="text-muted-foreground px-2 text-center text-xs">Preparando…</p>
          )
    const disconnectedVoiceChrome = (
      <div className="border-border/60 bg-muted/80 shrink-0 border-t p-3 backdrop-blur-sm">
        {panel}
      </div>
    )
    return (
      <div className="flex h-full min-h-0 min-w-0 flex-1 flex-row overflow-hidden">
        {rail}
        <div className="hidden h-full min-h-0 w-[240px] shrink-0 flex-col overflow-hidden border-r border-border bg-muted md:flex">
          <div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
            <div className="min-h-0 flex-1 overflow-hidden">{renderNav()}</div>
            <div className="shrink-0">{disconnectedVoiceChrome}</div>
            <UserAccountFooter />
          </div>
        </div>
        <div className="bg-background flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {renderMainDisconnected()}
        </div>
        <div className="hidden h-full min-h-0 w-[240px] shrink-0 flex-col overflow-hidden border-l border-border bg-muted lg:flex">
          <MembersList className="h-full min-h-0 w-full border-0 bg-transparent" />
        </div>
      </div>
    )
  }

  return (
    <Suspense fallback={<LiveKitChunkFallback />}>
      <VoiceSessionLiveKitLazy
        token={token!}
        serverUrl={serverUrl!}
        channelName={channelName}
        servers={servers}
        activeServerId={activeServerId}
        onHome={onHome}
        onSelectServer={onSelectServer}
        renderNav={renderNav}
        renderMainConnected={renderMainConnected}
      />
    </Suspense>
  )
}
