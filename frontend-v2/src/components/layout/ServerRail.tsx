import { MessageCircle } from 'lucide-react'
import { LUX_ICON_STROKE } from '@/lib/luxIcon'
import { useMobileNav } from '@/components/layout/MobileNavContext'
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

  const serverHasUnread = (serverId: string) => {
    return channels.some(
      (ch) => ch.server_id === serverId && (unreadCounts[ch.id] ?? 0) > 0,
    )
  }

  return (
    <aside
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
          const hasUnread = !active && serverHasUnread(srv.id)
          return (
            <div key={srv.id} className="relative">
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
              {hasUnread ? (
                <span className="bg-primary absolute -top-0.5 -right-0.5 size-3 rounded-full ring-2 ring-card" />
              ) : null}
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
