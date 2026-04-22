import { MessageCircle } from 'lucide-react'
import { LUX_ICON_STROKE } from '@/lib/luxIcon'
import { useMobileNav } from '@/components/layout/MobileNavContext'
import { isMessageNewerThanRead } from '@/lib/unreadUtils'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store/useAppStore'
import type { Server } from '@/types/models'

function serverInitials(name: string): string {
  const t = name.trim()
  if (!t) return '?'
  const parts = t.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase().slice(0, 2)
  }
  return t.slice(0, 2).toUpperCase()
}

export interface ServerRailProps {
  activeServerId: string | null
  servers: Server[]
  onHome: () => void
  onSelectServer: (id: string) => void
  className?: string
}

/** Columna fija de servidores (estilo Discord). */
export function ServerRail({
  activeServerId,
  servers,
  onHome,
  onSelectServer,
  className,
}: ServerRailProps) {
  const mobile = useMobileNav()
  const unreadCounts = useAppStore((s) => s.unreadCounts)
  const unreadDmCount = useAppStore((s) => s.unreadDmCount)
  const channels = useAppStore((s) => s.channels)
  const messagesByChannel = useAppStore((s) => s.messagesByChannel)
  const lastReadTimestamps = useAppStore((s) => s.lastReadTimestamps)
  const activeTextChannelId = useAppStore((s) => s.activeTextChannelId)

  const textChannelHasUnread = (ch: (typeof channels)[0]) => {
    if (ch.type !== 'text' || ch.is_archived) return false
    if ((unreadCounts[ch.id] ?? 0) > 0) return true
    if (ch.id === activeTextChannelId) return false
    const msgs = messagesByChannel[ch.id]
    const last = msgs?.[msgs.length - 1]
    if (!last) return false
    return isMessageNewerThanRead(last.created_at, lastReadTimestamps[ch.id])
  }

  const serverHasUnread = (serverId: string) =>
    channels.some((c) => c.server_id === serverId && textChannelHasUnread(c))

  return (
    <aside
      data-testid="server-rail"
      className={cn(
        'lux-panel-rail lux-panel-rail--sep text-card-foreground flex h-full min-h-0 w-[72px] min-w-[72px] max-w-[72px] shrink-0 flex-col overflow-x-hidden overflow-y-hidden',
        className,
      )}
      aria-label="Servidores"
    >
      <div
        className={cn(
          'flex min-h-0 flex-1 flex-col items-center gap-2 overflow-x-hidden overflow-y-auto overscroll-y-contain p-3',
          // Sin franja/scroll visible con pocos iconos; sigue scrolleable con rueda si hay muchos servidores
          '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        )}
      >
        <div className="relative shrink-0">
          <button
            type="button"
            data-testid="nav-home-dm"
            title="Inicio — mensajes directos"
            aria-label="Inicio — mensajes directos"
            aria-current={activeServerId == null ? 'true' : undefined}
            onClick={() => {
              onHome()
              mobile?.setNavSheetOpen(false)
            }}
            className={cn(
              'flex size-12 shrink-0 items-center justify-center rounded-[1.1rem] border border-transparent lux-transition [transition-property:color,background-color,box-shadow,transform]',
              activeServerId == null
                ? 'bg-primary text-primary-foreground shadow-[0_0_0_1px_oklch(1_0_0/0.12),inset_0_1px_0_0_oklch(1_0_0/0.18)] hover:brightness-[1.04] active:scale-[0.97]'
                : 'bg-muted/60 text-muted-foreground hover:border-border/60 hover:bg-muted hover:text-foreground hover:shadow-[inset_0_1px_0_0_oklch(1_0_0/0.06)] active:scale-[0.97]',
            )}
          >
            <MessageCircle
              className="lux-icon size-6 text-current"
              strokeWidth={LUX_ICON_STROKE}
              aria-hidden
            />
          </button>
          {unreadDmCount > 0 ? (
            <span
              key={unreadDmCount}
              className="dm-rail-unread-badge absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full border-2 border-card bg-destructive text-[10px] font-bold leading-none text-white shadow-[0_2px_8px_oklch(0.45_0.2_25/0.35)]"
              aria-label={`Mensajes directos no leídos: ${unreadDmCount > 99 ? 'más de 99' : unreadDmCount}`}
            >
              {unreadDmCount > 99 ? '99+' : unreadDmCount}
            </span>
          ) : null}
        </div>

        <div className="flex w-full shrink-0 justify-center p-2" aria-hidden>
          <div className="h-px w-8 rounded-full bg-gradient-to-r from-transparent via-border to-transparent opacity-80" />
        </div>

        {servers.map((srv) => {
          const active = srv.id === activeServerId
          const hasUnread = serverHasUnread(srv.id)
          return (
            <div key={srv.id} className="relative flex w-full justify-center pl-0.5">
              {hasUnread ? (
                <span
                  className="pointer-events-none absolute top-1/2 left-0 z-[1] h-7 w-1.5 -translate-y-1/2 rounded-l-full border border-border/40 bg-card shadow-[1px_0_2px_rgba(0,0,0,0.15)]"
                  aria-hidden
                />
              ) : null}
              <button
                type="button"
                title={srv.name}
                onClick={() => {
                  onSelectServer(srv.id)
                  mobile?.setNavSheetOpen(false)
                }}
                className={cn(
                  'flex size-12 shrink-0 items-center justify-center rounded-[1.1rem] border border-transparent text-xs font-semibold lux-transition [transition-property:color,background-color,box-shadow,transform] tracking-wide',
                  active
                    ? 'bg-primary text-primary-foreground shadow-[0_0_0_1px_oklch(1_0_0/0.12),inset_0_1px_0_0_oklch(1_0_0/0.18)] hover:brightness-[1.04] active:scale-[0.97]'
                    : 'bg-muted/60 text-muted-foreground hover:border-border/60 hover:bg-muted hover:text-foreground hover:shadow-[inset_0_1px_0_0_oklch(1_0_0/0.06)] active:scale-[0.97]',
                )}
              >
                {serverInitials(srv.name)}
              </button>
            </div>
          )
        })}
        {servers.length === 0 && (
          <div
            className="bg-muted/50 text-muted-foreground flex size-12 shrink-0 items-center justify-center rounded-[1.1rem] border border-dashed border-border/50 text-xs"
            title="Sin servidor"
          >
            —
          </div>
        )}
      </div>
    </aside>
  )
}
