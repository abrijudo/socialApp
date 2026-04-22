import { memo, useCallback, useMemo, useState } from 'react'
import { Check, Loader2, Mic, UserPlus, X } from 'lucide-react'
import { apiPatchJson, apiPostJson } from '@/lib/api'
import { UserProfilePopup } from '@/components/modals/UserProfilePopup'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { useAppStore } from '@/store/useAppStore'
import type { FriendEntry, FriendshipListItem, PresenceStatus, ServerMember } from '@/types/models'

function memberInitials(m: ServerMember): string {
  const p = m.profile
  const label = p?.display_name || p?.username || m.user_id.slice(0, 6)
  const t = label.trim()
  if (!t) return '?'
  const parts = t.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase().slice(0, 2)
  }
  return t.slice(0, 2).toUpperCase()
}

function memberDisplayName(m: ServerMember): string {
  return m.profile?.display_name || m.profile?.username || `Usuario ${m.user_id.slice(0, 6)}`
}

function statusDotClass(presence: PresenceStatus | undefined, offline: boolean): string {
  if (offline || !presence) {
    return 'bg-muted-foreground/50 ring-background ring-2'
  }
  if (presence === 'online') return 'bg-emerald-500 ring-background ring-2'
  if (presence === 'idle') return 'bg-amber-400 ring-background ring-2'
  return 'bg-destructive/90 ring-background ring-2'
}

function presenceLabel(presence: PresenceStatus | undefined, offline: boolean): string {
  if (offline || !presence) return 'Desconectado'
  if (presence === 'online') return 'En línea'
  if (presence === 'idle') return 'Ausente'
  return 'No molestar'
}

type FriendRowContext =
  | { kind: 'self' }
  | { kind: 'none' }
  | { kind: 'friend' }
  | { kind: 'outgoing' }
  | { kind: 'incoming'; friendshipId: string }

function getFriendRowContext(
  myId: string,
  otherId: string,
  friends: FriendEntry[],
  pending: { incoming: FriendshipListItem[]; outgoing: FriendshipListItem[] },
): FriendRowContext {
  if (otherId === myId) return { kind: 'self' }
  if (friends.some((f) => f.user.user_id === otherId)) return { kind: 'friend' }
  if (pending.outgoing.some((p) => p.user.user_id === otherId)) return { kind: 'outgoing' }
  const inc = pending.incoming.find((p) => p.user.user_id === otherId)
  if (inc) return { kind: 'incoming', friendshipId: inc.friendshipId }
  return { kind: 'none' }
}

const MemberRow = memo(function MemberRow({
  member,
  presence,
  offline,
  voiceChannelName,
  onViewProfile,
}: {
  member: ServerMember
  presence: PresenceStatus | undefined
  offline: boolean
  voiceChannelName?: string
  onViewProfile: (userId: string) => void
}) {
  const myId = useAppStore((s) => s.userId)
  const accessToken = useAppStore((s) => s.accessToken)
  const friends = useAppStore((s) => s.friends)
  const pending = useAppStore((s) => s.pendingRequests)
  const refreshFriends = useAppStore((s) => s.refreshFriends)
  const [actionBusy, setActionBusy] = useState(false)

  const friendCtx = useMemo(
    () => getFriendRowContext(myId, member.user_id, friends, pending),
    [myId, member.user_id, friends, pending],
  )

  const runFriendAction = useCallback(
    async (fn: () => Promise<void>) => {
      if (actionBusy) return
      setActionBusy(true)
      try {
        await fn()
        await refreshFriends()
      } catch (e) {
        toast.error((e as Error).message || 'No se pudo completar la acción.')
      } finally {
        setActionBusy(false)
      }
    },
    [actionBusy, refreshFriends],
  )

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="data-[state=open]:bg-background/50 flex w-full min-w-0 items-center gap-3 rounded-md px-2 py-1.5 text-left transition-colors duration-200 ease-in-out outline-none hover:bg-background/40"
        >
          <div className="relative shrink-0">
            <div
              className={cn(
                'flex size-8 items-center justify-center rounded-full text-[11px] font-medium',
                'bg-primary/10 text-primary',
              )}
              aria-hidden
            >
              {memberInitials(member)}
            </div>
            <span
              className={cn(
                'absolute right-0 bottom-0 size-2.5 rounded-full',
                statusDotClass(presence, offline),
              )}
              title={presenceLabel(presence, offline)}
              aria-hidden
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{memberDisplayName(member)}</div>
            <div className="text-muted-foreground truncate text-[11px]">
              {presenceLabel(presence, offline)}
              {voiceChannelName ? ` · En voz: #${voiceChannelName}` : ''}
            </div>
          </div>
          {voiceChannelName ? <Mic className="text-primary size-3.5 shrink-0" aria-hidden /> : null}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56" onCloseAutoFocus={(e) => e.preventDefault()}>
        <DropdownMenuLabel className="text-muted-foreground text-xs font-normal">
          {memberDisplayName(member)}
        </DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => onViewProfile(member.user_id)}>Ver perfil</DropdownMenuItem>
        {friendCtx.kind === 'self' ? null : (
          <>
            <DropdownMenuSeparator />
            {friendCtx.kind === 'none' && accessToken ? (
              <DropdownMenuItem
                onSelect={() => {
                  void runFriendAction(async () => {
                    await apiPostJson('/api/friends/request', accessToken, { targetUserId: member.user_id })
                    toast.success('Solicitud enviada')
                  })
                }}
                disabled={actionBusy}
              >
                {actionBusy ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <UserPlus className="size-4" />
                )}
                <span>Enviar solicitud de amistad</span>
              </DropdownMenuItem>
            ) : null}
            {friendCtx.kind === 'outgoing' ? (
              <DropdownMenuItem disabled>
                <span className="text-muted-foreground">Solicitud enviada (pendiente)</span>
              </DropdownMenuItem>
            ) : null}
            {friendCtx.kind === 'friend' ? (
              <DropdownMenuItem disabled>
                <span className="text-muted-foreground">Sois amigos</span>
              </DropdownMenuItem>
            ) : null}
            {friendCtx.kind === 'incoming' && accessToken ? (
              <>
                <DropdownMenuItem
                  onSelect={() => {
                    void runFriendAction(async () => {
                      await apiPatchJson('/api/friends/respond', accessToken, {
                        friendshipId: friendCtx.friendshipId,
                        action: 'accept',
                      })
                      toast.success('Solicitud aceptada')
                    })
                  }}
                  disabled={actionBusy}
                >
                  {actionBusy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                  <span>Aceptar solicitud</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => {
                    void runFriendAction(async () => {
                      await apiPatchJson('/api/friends/respond', accessToken, {
                        friendshipId: friendCtx.friendshipId,
                        action: 'decline',
                      })
                      toast.success('Solicitud rechazada')
                    })
                  }}
                  disabled={actionBusy}
                >
                  {actionBusy ? <Loader2 className="size-4 animate-spin" /> : <X className="size-4" />}
                  <span>Rechazar</span>
                </DropdownMenuItem>
              </>
            ) : null}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
})

export function MembersList({ className }: { className?: string }) {
  const members = useAppStore((s) => s.members)
  const membersLoading = useAppStore((s) => s.membersLoading)
  const onlineUsers = useAppStore((s) => s.onlineUsers)
  const channels = useAppStore((s) => s.channels)
  const voiceChannelOccupants = useAppStore((s) => s.voiceChannelOccupants)
  const [profileUserId, setProfileUserId] = useState<string | null>(null)

  const voiceChannelByUserId = useMemo(() => {
    const channelNameById = new Map(
      channels.filter((c) => c.type === 'voice').map((c) => [c.id, c.name] as const),
    )
    const byUser = new Map<string, string>()
    for (const [channelId, users] of Object.entries(voiceChannelOccupants)) {
      const channelName = channelNameById.get(channelId) || channelId
      for (const u of users || []) {
        if (!u?.userId) continue
        byUser.set(u.userId, channelName)
      }
    }
    return byUser
  }, [channels, voiceChannelOccupants])

  // Orden alfabético estable: solo se recalcula cuando cambia la lista de
  // miembros, NO cada vez que entra un evento de presencia.
  const sortedMembers = useMemo(() => {
    const list = members.filter((m) => m?.user_id).slice()
    list.sort((a, b) => memberDisplayName(a).localeCompare(memberDisplayName(b), 'es'))
    return list
  }, [members])

  // Set de IDs en línea: clave referencial del selector. Así la partición
  // sólo se rehace cuando cambia realmente el conjunto de usuarios online,
  // no cuando cambian otros datos ajenos (voz, canales, etc.).
  const onlineIds = useMemo(() => new Set(Object.keys(onlineUsers)), [onlineUsers])

  const { onlineMembers, offlineMembers } = useMemo(() => {
    const on: ServerMember[] = []
    const off: ServerMember[] = []
    for (const m of sortedMembers) {
      if (onlineIds.has(m.user_id)) on.push(m)
      else off.push(m)
    }
    return { onlineMembers: on, offlineMembers: off }
  }, [sortedMembers, onlineIds])

  return (
    <aside
      className={cn(
        'flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden bg-muted',
        className,
      )}
      aria-label="Miembros del servidor"
    >
      <header className="border-border flex h-12 shrink-0 items-center border-b px-3 shadow-sm sm:px-4">
        <h2 className="text-foreground min-w-0 flex-1 truncate text-sm font-semibold">Miembros</h2>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3">
        {membersLoading ? (
          <div className="space-y-px" aria-busy="true" aria-label="Cargando miembros">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full rounded-md" />
            ))}
          </div>
        ) : (
          <>
        <section aria-labelledby="members-online">
          <h3
            id="members-online"
            className="text-muted-foreground px-0 pb-1 text-[11px] font-semibold tracking-wide uppercase"
          >
            En línea — {onlineMembers.length}
          </h3>
          <ul className="space-y-px">
            {onlineMembers.map((m) => (
              <li key={m.user_id}>
                <MemberRow
                  member={m}
                  presence={onlineUsers[m.user_id]}
                  offline={false}
                  voiceChannelName={voiceChannelByUserId.get(m.user_id)}
                  onViewProfile={setProfileUserId}
                />
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="members-offline">
          <h3
            id="members-offline"
            className="text-muted-foreground px-0 pb-1 text-[11px] font-semibold tracking-wide uppercase"
          >
            Desconectados — {offlineMembers.length}
          </h3>
          <ul className="space-y-px">
            {offlineMembers.map((m) => (
              <li key={m.user_id}>
                <MemberRow
                  member={m}
                  presence={undefined}
                  offline
                  voiceChannelName={voiceChannelByUserId.get(m.user_id)}
                  onViewProfile={setProfileUserId}
                />
              </li>
            ))}
          </ul>
        </section>
          </>
        )}
      </div>

      {profileUserId ? (
        <UserProfilePopup
          open
          onOpenChange={(open) => { if (!open) setProfileUserId(null) }}
          userId={profileUserId}
        />
      ) : null}
    </aside>
  )
}
