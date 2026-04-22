import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, UserPlus } from 'lucide-react'
import { apiGetJson, apiPostJson } from '@/lib/api'
import { UserAccountFooter } from '@/components/layout/UserAccountFooter'
import { VoiceSidebarDock } from '@/components/voice/VoiceSidebarDock'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { LUX_ICON_STROKE, luxIconSm } from '@/lib/luxIcon'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { useMobileNav } from '@/components/layout/MobileNavContext'
import { useAppStore } from '@/store/useAppStore'
import type { ChannelMessage, DmChannelSummary } from '@/types/models'

function normalizeUsernameInput(raw: string): string {
  return raw
    .trim()
    .replace(/^@+/, '')
    .replace(/\s+/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '')
    .toLowerCase()
    .slice(0, 20)
}

function otherInitials(dm: DmChannelSummary): string {
  const p = dm.otherUser
  const label = p?.display_name || p?.username || '?'
  const t = label.trim()
  if (!t) return '?'
  const parts = t.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase().slice(0, 2)
  }
  return t.slice(0, 2).toUpperCase()
}

function otherName(dm: DmChannelSummary): string {
  const p = dm.otherUser
  return p?.display_name?.trim() || p?.username || 'Usuario'
}

function otherSubtitle(dm: DmChannelSummary): string {
  const bio = dm.otherUser?.bio?.trim()
  if (bio) return bio
  const u = dm.otherUser?.username
  if (u) return `@${u}`
  return ''
}

function lastMessageActivityMs(
  channelId: string,
  byChannel: Record<string, ChannelMessage[] | undefined>,
): number {
  const list = byChannel[channelId]
  if (!list?.length) return 0
  const last = list[list.length - 1]!
  const t = new Date(last.created_at).getTime()
  return Number.isFinite(t) ? t : 0
}

/** Columna de conversaciones DM (vista Inicio). */
export function DmSidebar() {
  const mobile = useMobileNav()
  const accessToken = useAppStore((s) => s.accessToken)
  const dmChannels = useAppStore((s) => s.dmChannels)
  const dmMessagesByChannel = useAppStore((s) => s.dmMessagesByChannel)
  const activeDmChannelId = useAppStore((s) => s.activeDmChannelId)
  const unreadCounts = useAppStore((s) => s.unreadCounts)
  const setDmChannels = useAppStore((s) => s.setDmChannels)
  const setActiveDmChannelId = useAppStore((s) => s.setActiveDmChannelId)
  const friends = useAppStore((s) => s.friends)
  const activeVoiceChannelId = useAppStore((s) => s.activeVoiceChannelId)
  const onlineUsers = useAppStore((s) => s.onlineUsers)
  const inVoice = Boolean(activeVoiceChannelId)
  const [listLoading, setListLoading] = useState(false)
  const [dmMenuOpen, setDmMenuOpen] = useState(false)

  const dmChannelsNewestFirst = useMemo(() => {
    if (dmChannels.length === 0) return dmChannels
    return [...dmChannels].sort((a, b) => {
      const ta = lastMessageActivityMs(a.id, dmMessagesByChannel)
      const tb = lastMessageActivityMs(b.id, dmMessagesByChannel)
      if (tb !== ta) return tb - ta
      return a.id.localeCompare(b.id)
    })
  }, [dmChannels, dmMessagesByChannel])

  const refreshDmList = useCallback(async () => {
    if (!accessToken) return
    setListLoading(true)
    try {
      const list = await apiGetJson<DmChannelSummary[]>('/api/dm', accessToken)
      setDmChannels(Array.isArray(list) ? list : [])
    } catch {
      setDmChannels([])
    } finally {
      setListLoading(false)
    }
  }, [accessToken, setDmChannels])

  useEffect(() => {
    if (!accessToken) return
    // El bootstrap ya incluye `dmChannels`; evitar un segundo GET /api/dm si hay datos.
    if (dmChannels.length > 0) return
    void refreshDmList()
  }, [accessToken, dmChannels.length, refreshDmList])

  const openOrCreateDmWithUserId = useCallback(
    async (otherUserId: string) => {
      if (!accessToken) return
      try {
        const res = await apiPostJson<{ id: string }>('/api/dm', accessToken, {
          otherUserId,
        })
        await refreshDmList()
        if (res?.id) {
          setActiveDmChannelId(res.id)
          mobile?.setNavSheetOpen(false)
          setDmMenuOpen(false)
          toast.success('Conversación abierta')
        }
      } catch (e) {
        toast.error((e as Error).message || 'No se pudo abrir el DM.')
      }
    },
    [accessToken, mobile, refreshDmList, setActiveDmChannelId],
  )

  async function handleNewDmByUsernamePrompt() {
    setDmMenuOpen(false)
    const raw = window.prompt('Nombre de usuario del destinatario (sin @):', '')
    if (raw == null) return
    const key = normalizeUsernameInput(raw)
    if (key.length < 2) {
      toast.error('El nombre debe tener al menos 2 caracteres válidos.')
      return
    }
    if (!accessToken) return

    const sb = getSupabaseBrowserClient()
    const { data: row, error } = await sb.from('profiles').select('user_id').eq('username', key).maybeSingle()

    if (error || !row?.user_id) {
      toast.error('No se encontró un usuario con ese nombre.')
      return
    }
    await openOrCreateDmWithUserId(row.user_id)
  }

  return (
    <nav
      className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden"
      aria-label="Mensajes directos"
    >
      <header className="border-b border-white/[0.05] bg-foreground/[0.02] shadow-[inset_0_-1px_0_0_oklch(0_0_0/0.08)] flex h-12 shrink-0 items-center justify-between px-3 sm:px-4">
        <div className="flex min-w-0 flex-1 items-center gap-3 pl-2">
          <span className="w-8 shrink-0" aria-hidden />
          <h1
            className="min-w-0 flex-1 cursor-default text-[10px] font-semibold text-muted-foreground/95 uppercase tracking-[0.16em] transition-colors duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:text-foreground/90"
            title="Mensajes Directos"
          >
            Mensajes directos
          </h1>
        </div>
        <DropdownMenu open={dmMenuOpen} onOpenChange={setDmMenuOpen}>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="lux-icon-button text-muted-foreground size-8 shrink-0 opacity-90 transition-opacity hover:opacity-100"
              title="Nuevo mensaje directo"
              aria-label="Nuevo mensaje directo"
            >
              <Plus className={cn(luxIconSm, 'size-3.5')} strokeWidth={LUX_ICON_STROKE} aria-hidden />
            </Button>
          </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 max-h-[min(60vh,22rem)] overflow-y-auto">
              <DropdownMenuLabel className="text-muted-foreground text-xs font-medium">
                Chatear con un amigo
              </DropdownMenuLabel>
              {friends.length === 0 ? (
                <p className="text-muted-foreground px-2 py-1.5 text-xs">
                  Aún no tienes amigos aceptados. Gestionálos en el menú de cuenta.
                </p>
              ) : (
                friends.map((f) => (
                  <DropdownMenuItem
                    key={f.friendshipId}
                    onSelect={() => void openOrCreateDmWithUserId(f.user.user_id)}
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {f.user.display_name?.trim() || f.user.username}
                    </span>
                  </DropdownMenuItem>
                ))
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => void handleNewDmByUsernamePrompt()}>
                <UserPlus className={cn(luxIconSm, 'size-4')} strokeWidth={LUX_ICON_STROKE} />
                Buscar por nombre de usuario…
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {listLoading && dmChannels.length === 0 ? (
          <div className="space-y-1 px-3 pt-2 pb-0" aria-busy="true" aria-label="Cargando conversaciones">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full rounded-lg" />
            ))}
          </div>
        ) : dmChannels.length === 0 ? (
          <p className="text-muted-foreground px-3 py-6 text-center text-xs leading-relaxed">
            No tienes conversaciones. Pulsa + para buscar por nombre de usuario.
          </p>
        ) : (
          <ul className="space-y-1 px-3 pt-2 pb-0">
            {dmChannelsNewestFirst.map((dm) => {
              const active = dm.id === activeDmChannelId
              const unread = unreadCounts[dm.id] ?? 0
              const otherId = dm.otherUser?.user_id
              const presence = otherId ? onlineUsers[otherId] : undefined
              const isOnline = Boolean(presence)
              const subtitle = otherSubtitle(dm)
              return (
                <li key={dm.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveDmChannelId(dm.id)
                      mobile?.setNavSheetOpen(false)
                    }}
                    className={cn(
                      'group/dm flex w-full items-center gap-3 rounded-[0.65rem] border border-transparent px-2.5 py-2 text-left',
                      'transition-[color,background-color,border-color,box-shadow,transform] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]',
                      'bg-transparent',
                      !active &&
                        'hover:translate-x-0.5 hover:border-border/40 hover:bg-background/20 hover:shadow-[inset_0_1px_0_0_oklch(1_0_0/0.04)] motion-reduce:hover:translate-x-0',
                      active &&
                        'border-primary/30 bg-primary/10 shadow-[inset_0_0_0_1px_oklch(0.62_0.12_280/0.18),inset_0_1px_0_0_oklch(1_0_0/0.08)]',
                    )}
                  >
                    <div className="relative shrink-0" aria-hidden>
                      <div className="from-primary/15 to-primary/5 text-primary lux-avatar flex size-8 items-center justify-center bg-gradient-to-br text-xs font-semibold">
                        {otherInitials(dm)}
                      </div>
                      {otherId ? (
                        <div
                          className={cn(
                            'absolute -bottom-0.5 -right-0.5 z-[1] size-3 rounded-full border-2 border-background/85',
                            isOnline ? 'bg-emerald-500 lux-presence-dot--online' : 'lux-presence-dot--offline bg-muted-foreground/85',
                          )}
                          title={isOnline ? 'En línea' : 'Desconectado'}
                        />
                      ) : null}
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-left">
                      <div className="truncate text-sm font-semibold tracking-tight text-foreground">
                        {otherName(dm)}
                      </div>
                      {subtitle ? (
                        <p
                          className={cn(
                            'truncate text-xs text-muted-foreground/80',
                            active && 'text-muted-foreground/90',
                          )}
                        >
                          {subtitle}
                        </p>
                      ) : null}
                    </div>
                    {unread > 0 && !active ? (
                      <span className="bg-destructive/90 text-destructive-foreground flex h-5 min-w-5 shrink-0 items-center justify-center self-center rounded-md px-1 text-[10px] font-bold tabular-nums shadow-[0_0_0_1px_oklch(1_0_0/0.1)]">
                        {unread > 99 ? '99+' : unread}
                      </span>
                    ) : null}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {inVoice ? (
        <div className="shrink-0">
          <VoiceSidebarDock />
        </div>
      ) : null}

      <UserAccountFooter />
    </nav>
  )
}
