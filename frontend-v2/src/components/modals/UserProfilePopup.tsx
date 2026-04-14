import { useState } from 'react'
import { MessageCircle } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { apiPostJson } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store/useAppStore'
import type { Profile, ServerMember, ServerRole } from '@/types/models'

function roleLabel(role: ServerRole | undefined): string {
  switch (role) {
    case 'owner':
      return 'Propietario'
    case 'admin':
      return 'Administrador'
    case 'mod':
      return 'Moderador'
    default:
      return 'Miembro'
  }
}

function roleBadgeClass(role: ServerRole | undefined): string {
  switch (role) {
    case 'owner':
      return 'bg-amber-500/15 text-amber-400'
    case 'admin':
      return 'bg-red-500/15 text-red-400'
    case 'mod':
      return 'bg-blue-500/15 text-blue-400'
    default:
      return 'bg-muted text-muted-foreground'
  }
}

function statusColor(presence: string | undefined): string {
  if (presence === 'online') return 'bg-emerald-500'
  if (presence === 'idle') return 'bg-amber-400'
  if (presence === 'dnd') return 'bg-destructive'
  return 'bg-muted-foreground/50'
}

function statusText(presence: string | undefined): string {
  if (presence === 'online') return 'En línea'
  if (presence === 'idle') return 'Ausente'
  if (presence === 'dnd') return 'No molestar'
  return 'Desconectado'
}

function initials(name: string): string {
  const t = name.trim()
  if (!t) return '?'
  const parts = t.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase().slice(0, 2)
  return t.slice(0, 2).toUpperCase()
}

export interface UserProfilePopupProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  userId: string
}

export function UserProfilePopup({ open, onOpenChange, userId: targetUserId }: UserProfilePopupProps) {
  const members = useAppStore((s) => s.members)
  const onlineUsers = useAppStore((s) => s.onlineUsers)
  const accessToken = useAppStore((s) => s.accessToken)
  const localUserId = useAppStore((s) => s.userId)
  const setActiveDmChannelId = useAppStore((s) => s.setActiveDmChannelId)
  const [dmSending, setDmSending] = useState(false)

  const member: ServerMember | undefined = members.find((m) => m.user_id === targetUserId)
  const profile: Profile | null = member?.profile ?? null
  const presence = onlineUsers[targetUserId]
  const displayName = profile?.display_name || profile?.username || `Usuario ${targetUserId.slice(0, 6)}`
  const isSelf = targetUserId === localUserId

  async function handleSendDm() {
    if (!accessToken || isSelf) return
    setDmSending(true)
    try {
      const res = await apiPostJson<{ id: string }>('/api/dm', accessToken, {
        otherUserId: targetUserId,
      })
      if (res?.id) {
        setActiveDmChannelId(res.id)
        onOpenChange(false)
      }
    } catch {
      // silently fail
    } finally {
      setDmSending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="relative">
              <div
                className={cn(
                  'flex size-16 shrink-0 items-center justify-center rounded-full text-lg font-bold',
                  'bg-primary/12 text-primary',
                )}
              >
                {profile?.avatar_url ? (
                  <img src={profile.avatar_url} alt="" className="size-full rounded-full object-cover" />
                ) : (
                  initials(displayName)
                )}
              </div>
              <span
                className={cn(
                  'absolute right-0 bottom-0 size-4 rounded-full ring-2 ring-popover',
                  statusColor(presence),
                )}
              />
            </div>
            <div className="min-w-0 flex-1">
              <DialogTitle className="truncate">{displayName}</DialogTitle>
              {profile?.username ? (
                <p className="text-muted-foreground mt-0.5 truncate text-xs">@{profile.username}</p>
              ) : null}
              <div className="mt-1 flex items-center gap-2">
                <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-semibold', roleBadgeClass(member?.role))}>
                  {roleLabel(member?.role)}
                </span>
                <span className="text-muted-foreground text-[11px]">{statusText(presence)}</span>
              </div>
            </div>
          </div>
        </DialogHeader>

        {profile?.bio ? (
          <DialogDescription className="whitespace-pre-wrap">{profile.bio}</DialogDescription>
        ) : null}

        <div className="text-muted-foreground space-y-1 text-xs">
          {member?.joined_at ? (
            <p>Miembro desde {new Date(member.joined_at).toLocaleDateString('es', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
          ) : null}
        </div>

        {!isSelf ? (
          <Button
            className="w-full"
            size="sm"
            onClick={() => void handleSendDm()}
            disabled={dmSending}
          >
            <MessageCircle className="mr-2 size-4" />
            Enviar mensaje
          </Button>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
