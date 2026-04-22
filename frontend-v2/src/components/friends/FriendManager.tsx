import { useState } from 'react'
import { Check, UserPlus, X, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { apiPatchJson, apiPostJson } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { useAppStore } from '@/store/useAppStore'

type Tab = 'add' | 'incoming' | 'outgoing'

function normalizeUsernameInput(raw: string): string {
  return raw
    .trim()
    .replace(/^@+/, '')
    .replace(/\s+/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '')
    .toLowerCase()
    .slice(0, 20)
}

type FriendManagerProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Añadir amigos y gestionar solicitudes (entrantes y salientes).
 */
export function FriendManager({ open, onOpenChange }: FriendManagerProps) {
  const accessToken = useAppStore((s) => s.accessToken)
  const friends = useAppStore((s) => s.friends)
  const pending = useAppStore((s) => s.pendingRequests)
  const refreshFriends = useAppStore((s) => s.refreshFriends)
  const [tab, setTab] = useState<Tab>('add')
  const [username, setUsername] = useState('')
  const [sending, setSending] = useState(false)
  const [actionId, setActionId] = useState<string | null>(null)

  async function handleSendRequest() {
    const key = normalizeUsernameInput(username)
    if (key.length < 2) {
      toast.error('Escribe al menos 2 caracteres válidos (letras, números, . _ -).')
      return
    }
    if (!accessToken) return
    setSending(true)
    try {
      await apiPostJson<{ ok: boolean }>('/api/friends/request', accessToken, { targetUsername: key })
      toast.success('Solicitud enviada')
      setUsername('')
      setTab('outgoing')
      await refreshFriends()
    } catch (e) {
      toast.error((e as Error).message || 'No se pudo enviar la solicitud.')
    } finally {
      setSending(false)
    }
  }

  async function respond(friendshipId: string, action: 'accept' | 'decline') {
    if (!accessToken) return
    setActionId(friendshipId)
    try {
      await apiPatchJson<{ ok: boolean }>('/api/friends/respond', accessToken, { friendshipId, action })
      toast.success(action === 'accept' ? 'Amistad aceptada' : 'Solicitud rechazada')
      await refreshFriends()
    } catch (e) {
      toast.error((e as Error).message || 'No se pudo completar la acción.')
    } finally {
      setActionId(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-border sm:max-w-md" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle className="font-heading">Amigos</DialogTitle>
          <DialogDescription className="text-muted-foreground text-sm">
            Añade por nombre de usuario y revisa las solicitudes pendientes.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-1 flex flex-wrap gap-1">
          {(
            [
              { id: 'add' as const, label: 'Añadir', badge: 0 },
              { id: 'incoming' as const, label: 'Recibidas', badge: pending.incoming.length },
              { id: 'outgoing' as const, label: 'Enviadas', badge: pending.outgoing.length },
            ] as const
          ).map((t) => (
            <Button
              key={t.id}
              type="button"
              size="sm"
              variant={tab === t.id ? 'default' : 'outline'}
              className="gap-1.5"
              onClick={() => setTab(t.id)}
            >
              {t.label}
              {t.badge > 0 ? (
                <span className="bg-background/20 rounded px-1 text-[10px] font-semibold">
                  {t.badge}
                </span>
              ) : null}
            </Button>
          ))}
        </div>

        <div className="min-h-[220px]">
          {tab === 'add' ? (
            <div className="space-y-3">
              <p className="text-muted-foreground text-xs">Nombre de usuario (sin @)</p>
              <div className="flex gap-2">
                <Input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="p. ej. maria_92"
                  autoComplete="off"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      void handleSendRequest()
                    }
                  }}
                />
                <Button type="button" disabled={sending} onClick={() => void handleSendRequest()}>
                  {sending ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
                </Button>
              </div>
              <p className="text-muted-foreground text-[11px]">
                Tienes {friends.length} amigo{friends.length === 1 ? '' : 's'}.
              </p>
            </div>
          ) : null}

          {tab === 'incoming' ? (
            <ul className="max-h-52 space-y-2 overflow-y-auto pr-1">
              {pending.incoming.length === 0 ? (
                <li className="text-muted-foreground text-center text-sm">No hay solicitudes entrantes.</li>
              ) : (
                pending.incoming.map((r) => (
                  <li
                    key={r.friendshipId}
                    className="border-border flex items-center justify-between gap-2 rounded-md border p-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {r.user.display_name?.trim() || r.user.username}
                      </p>
                      <p className="text-muted-foreground truncate text-xs">@{r.user.username}</p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        type="button"
                        size="icon"
                        className="size-8"
                        title="Aceptar"
                        disabled={actionId === r.friendshipId}
                        onClick={() => void respond(r.friendshipId, 'accept')}
                      >
                        {actionId === r.friendshipId ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Check className="size-4" />
                        )}
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="secondary"
                        className="size-8"
                        title="Rechazar"
                        disabled={actionId === r.friendshipId}
                        onClick={() => void respond(r.friendshipId, 'decline')}
                      >
                        <X className="size-4" />
                      </Button>
                    </div>
                  </li>
                ))
              )}
            </ul>
          ) : null}

          {tab === 'outgoing' ? (
            <ul className="max-h-52 space-y-2 overflow-y-auto pr-1">
              {pending.outgoing.length === 0 ? (
                <li className="text-muted-foreground text-center text-sm">No has enviado solicitudes recientes.</li>
              ) : (
                pending.outgoing.map((r) => (
                  <li
                    key={r.friendshipId}
                    className="border-border flex items-center justify-between gap-2 rounded-md border p-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {r.user.display_name?.trim() || r.user.username}
                      </p>
                      <p className="text-muted-foreground truncate text-xs">@{r.user.username}</p>
                    </div>
                    <span className="text-muted-foreground shrink-0 text-[10px] font-medium uppercase">
                      Pendiente
                    </span>
                  </li>
                ))
              )}
            </ul>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}
