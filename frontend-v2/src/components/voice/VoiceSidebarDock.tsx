import { useMemo } from 'react'
import { Loader2 } from 'lucide-react'
import { VoiceControlBar } from '@/components/voice/VoiceControlBar'
import { useVoiceConnection } from '@/components/voice/voiceConnectionContext'
import { useMatchMedia } from '@/hooks/useMatchMedia'
import { useAppStore } from '@/store/useAppStore'
import { cn } from '@/lib/utils'

/**
 * Bloque inferior del sidebar (estilo Discord): estado de conexión y controles
 * de voz cuando `activeVoiceChannelId` está activo. Requiere `VideoConnectionProvider`
 * mientras dure la conexión (hijo de `VoiceSession`).
 */
export function VoiceSidebarDock() {
  const activeVoiceChannelId = useAppStore((s) => s.activeVoiceChannelId)
  const channels = useAppStore((s) => s.channels)
  const { liveKitReady, isLoading, error } = useVoiceConnection()
  const mdUp = useMatchMedia('(min-width: 768px)')

  const channelName = useMemo(
    () => (activeVoiceChannelId ? channels.find((c) => c.id === activeVoiceChannelId)?.name : undefined),
    [channels, activeVoiceChannelId],
  )

  if (!activeVoiceChannelId) return null

  if (error) {
    if (!mdUp) return null
    return (
      <div
        className="border-border/60 bg-muted/80 border-t p-3 backdrop-blur-sm"
        role="alert"
      >
        <p className="text-destructive text-center text-xs leading-snug">{error}</p>
      </div>
    )
  }

  if (!liveKitReady) {
    if (!mdUp) return null
    return (
      <div
        className={cn(
          'border-border/60 bg-muted/80 flex shrink-0 flex-col gap-2 border-t p-3 backdrop-blur-sm',
        )}
      >
        <div className="min-w-0">
          <p className="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase">
            Voz
          </p>
          {channelName ? (
            <p className="text-foreground mt-0.5 truncate text-sm font-medium" title={channelName}>
              #{channelName}
            </p>
          ) : null}
        </div>
        <div className="text-muted-foreground flex items-center justify-center gap-2 py-2 text-xs">
          {isLoading ? (
            <>
              <Loader2 className="text-primary size-4 shrink-0 animate-spin" aria-hidden />
              <span>Conectando a voz…</span>
            </>
          ) : (
            <span>Preparando conexión…</span>
          )}
        </div>
      </div>
    )
  }

  if (!mdUp) {
    return null
  }

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
      <VoiceControlBar />
    </div>
  )
}
