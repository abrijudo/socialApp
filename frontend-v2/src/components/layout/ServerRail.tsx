import { MessageCircle } from 'lucide-react'
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
  const channels = useAppStore((s) => s.channels)

  const serverHasUnread = (serverId: string) => {
    return channels.some(
      (ch) => ch.server_id === serverId && (unreadCounts[ch.id] ?? 0) > 0,
    )
  }

  return (
    <aside
      className={cn(
        'bg-card text-card-foreground flex h-full min-h-0 w-[72px] shrink-0 flex-col overflow-hidden border-r border-border',
        className,
      )}
      aria-label="Servidores"
    >
      <div className="flex min-h-0 flex-1 flex-col items-center gap-2 overflow-y-auto p-3">
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
            'flex size-12 shrink-0 items-center justify-center rounded-[20px] transition-colors',
            activeServerId == null
              ? 'bg-primary text-primary-foreground ring-2 ring-ring'
              : 'bg-muted text-muted-foreground hover:bg-muted/80',
          )}
        >
          <MessageCircle className="size-6" aria-hidden />
        </button>

        <div className="flex w-full shrink-0 justify-center p-2" aria-hidden>
          <div className="bg-border h-px w-8 rounded-full" />
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
                  'flex size-12 shrink-0 items-center justify-center rounded-[20px] text-xs font-semibold transition-colors',
                  active
                    ? 'bg-primary text-primary-foreground ring-2 ring-ring'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80',
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
            className="bg-muted text-muted-foreground flex size-12 shrink-0 items-center justify-center rounded-[20px] text-xs"
            title="Sin servidor"
          >
            —
          </div>
        )}
      </div>
    </aside>
  )
}
