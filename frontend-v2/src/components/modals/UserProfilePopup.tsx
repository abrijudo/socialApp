import { useEffect, useId, useRef, useState } from 'react'
import { Camera, Loader2, MessageCircle } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { apiPostJson } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store/useAppStore'
import type { DmChannelSummary, Profile, ProfileStatus, ServerMember, ServerRole } from '@/types/models'
import { toast } from 'sonner'

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

function rowToProfile(row: Record<string, unknown>): Profile {
  return {
    user_id: String(row.user_id),
    username: String(row.username ?? ''),
    display_name: String(row.display_name ?? row.username ?? ''),
    avatar_url: row.avatar_url ? String(row.avatar_url) : null,
    bio: String(row.bio ?? ''),
    status: (row.status as ProfileStatus) || 'offline',
    updated_at: row.updated_at ? String(row.updated_at) : undefined,
    last_login: row.last_login != null ? String(row.last_login) : null,
  }
}

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(r.error)
    r.readAsDataURL(file)
  })
}

export interface UserProfilePopupProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  userId: string
}

export function UserProfilePopup({ open, onOpenChange, userId: targetUserId }: UserProfilePopupProps) {
  const members = useAppStore((s) => s.members)
  const storeProfile = useAppStore((s) => s.profile)
  const onlineUsers = useAppStore((s) => s.onlineUsers)
  const accessToken = useAppStore((s) => s.accessToken)
  const localUserId = useAppStore((s) => s.userId)
  const applyProfileUpdate = useAppStore((s) => s.applyProfileUpdate)
  const setActiveDmChannelId = useAppStore((s) => s.setActiveDmChannelId)
  const setDmChannels = useAppStore((s) => s.setDmChannels)
  const dmChannels = useAppStore((s) => s.dmChannels)
  const [dmSending, setDmSending] = useState(false)

  const [editDisplayName, setEditDisplayName] = useState('')
  const [editBio, setEditBio] = useState('')
  const [editAvatarUrl, setEditAvatarUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const formId = useId()

  const member: ServerMember | undefined = members.find((m) => m.user_id === targetUserId)
  const profile: Profile | null =
    targetUserId === localUserId
      ? (storeProfile ?? member?.profile ?? null)
      : (member?.profile ?? null)
  const presence = onlineUsers[targetUserId]
  const displayName = profile?.display_name || profile?.username || `Usuario ${targetUserId.slice(0, 6)}`
  const isSelf = targetUserId === localUserId

  useEffect(() => {
    if (!open || !isSelf || !profile) return
    setEditDisplayName(profile.display_name?.trim() || profile.username || '')
    setEditBio(profile.bio || '')
    setEditAvatarUrl(profile.avatar_url || '')
  }, [open, isSelf, profile?.user_id, profile?.display_name, profile?.bio, profile?.avatar_url])

  async function handleAvatarFile(file: File) {
    if (!accessToken) return
    if (!file.type.startsWith('image/')) {
      toast.error('Elige un archivo de imagen.')
      return
    }
    if (file.size > 8 * 1024 * 1024) {
      toast.error('La imagen es demasiado grande (máx. 8 MB).')
      return
    }
    setUploadingAvatar(true)
    try {
      const data = await readFileAsDataURL(file)
      const { url } = await apiPostJson<{ url: string }>('/api/upload', accessToken, {
        data,
        mimeType: file.type,
        fileName: file.name,
      })
      setEditAvatarUrl(url)
      toast.success('Foto actualizada (pulsa Guardar para aplicar al perfil)')
    } catch (e) {
      toast.error((e as Error).message || 'Error al subir la imagen')
    } finally {
      setUploadingAvatar(false)
    }
  }

  async function handleSaveProfile() {
    if (!accessToken || !profile) return
    const username = profile.username.trim()
    const dn = editDisplayName.trim()
    if (dn.length < 2) {
      toast.error('El nombre visible debe tener al menos 2 caracteres.')
      return
    }
    if (dn.length > 30) {
      toast.error('El nombre visible admite como máximo 30 caracteres.')
      return
    }
    if (editBio.length > 180) {
      toast.error('La descripción admite como máximo 180 caracteres.')
      return
    }
    setSaving(true)
    try {
      const row = await apiPostJson<Record<string, unknown>>('/api/profiles/upsert', accessToken, {
        username,
        displayName: dn,
        bio: editBio.trim(),
        avatarUrl: editAvatarUrl.trim(),
        status: profile.status || 'online',
      })
      const next = rowToProfile(row)
      applyProfileUpdate(next)
      toast.success('Perfil guardado')
      onOpenChange(false)
    } catch (e) {
      toast.error((e as Error).message || 'No se pudo guardar')
    } finally {
      setSaving(false)
    }
  }

  async function handleSendDm() {
    if (!accessToken || isSelf) return
    setDmSending(true)
    try {
      const res = await apiPostJson<{ id: string }>('/api/dm', accessToken, {
        otherUserId: targetUserId,
      })
      if (res?.id) {
        const alreadyListed = dmChannels.some((d) => d.id === res.id)
        if (!alreadyListed) {
          const other: DmChannelSummary['otherUser'] = profile
            ? { ...profile, user_id: targetUserId }
            : {
                user_id: targetUserId,
                username: '',
                display_name: '',
                avatar_url: null,
                bio: '',
                status: 'offline',
              }
          setDmChannels([...dmChannels, { id: res.id, otherUser: other }])
        }
        setActiveDmChannelId(res.id)
        onOpenChange(false)
      }
    } catch {
      // silently fail
    } finally {
      setDmSending(false)
    }
  }

  const avatarPreview = isSelf && editAvatarUrl ? editAvatarUrl : profile?.avatar_url

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn('gap-4', isSelf ? 'sm:max-w-md' : 'sm:max-w-sm')}>
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div className="relative shrink-0">
              <div
                className={cn(
                  'flex size-16 items-center justify-center overflow-hidden rounded-full text-lg font-bold',
                  'bg-primary/12 text-primary',
                )}
              >
                {avatarPreview ? (
                  <img src={avatarPreview} alt="" className="size-full object-cover" />
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
              {isSelf ? (
                <>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    aria-hidden
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      e.target.value = ''
                      if (f) void handleAvatarFile(f)
                    }}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    size="icon-xs"
                    className="absolute -right-1 -bottom-1 size-7 rounded-full shadow-md"
                    title="Cambiar foto"
                    disabled={uploadingAvatar}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {uploadingAvatar ? (
                      <Loader2 className="size-3.5 animate-spin" aria-hidden />
                    ) : (
                      <Camera className="size-3.5" aria-hidden />
                    )}
                  </Button>
                </>
              ) : null}
            </div>
            <div className="min-w-0 flex-1">
              {isSelf ? (
                <div className="space-y-2 text-left">
                  <Label htmlFor={`${formId}-name`} className="text-xs">
                    Nombre visible
                  </Label>
                  <Input
                    id={`${formId}-name`}
                    value={editDisplayName}
                    onChange={(e) => setEditDisplayName(e.target.value)}
                    maxLength={30}
                    autoComplete="nickname"
                    className="h-9"
                  />
                </div>
              ) : (
                <>
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
                </>
              )}
            </div>
          </div>
        </DialogHeader>

        {isSelf ? (
          <div className="space-y-3">
            <div className="space-y-2">
              <Label className="text-muted-foreground text-xs">Nombre de usuario</Label>
              <p className="text-foreground truncate text-sm">@{profile?.username ?? '…'}</p>
              <p className="text-muted-foreground text-[11px] leading-snug">
                El identificador no se puede cambiar desde aquí (afecta enlaces y menciones).
              </p>
            </div>
            {editAvatarUrl ? (
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-destructive h-8 text-xs"
                  onClick={() => setEditAvatarUrl('')}
                >
                  Quitar foto
                </Button>
              </div>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor={`${formId}-bio`} className="text-xs">
                Descripción / bio
              </Label>
              <textarea
                id={`${formId}-bio`}
                value={editBio}
                onChange={(e) => setEditBio(e.target.value)}
                maxLength={180}
                rows={4}
                placeholder="Cuéntame algo sobre ti…"
                className="border-input bg-background placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-primary/50 w-full resize-none rounded-lg border px-2.5 py-2 text-sm outline-none focus-visible:ring-2"
              />
              <p className="text-muted-foreground text-right text-[11px]">{editBio.length}/180</p>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={saving}>
                Cancelar
              </Button>
              <Button type="button" size="sm" onClick={() => void handleSaveProfile()} disabled={saving || uploadingAvatar}>
                {saving ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
                    Guardando…
                  </>
                ) : (
                  'Guardar cambios'
                )}
              </Button>
            </div>
          </div>
        ) : (
          <>
            {profile?.bio ? (
              <DialogDescription className="whitespace-pre-wrap">{profile.bio}</DialogDescription>
            ) : null}

            <div className="text-muted-foreground space-y-1 text-xs">
              {member?.joined_at ? (
                <p>
                  Miembro desde{' '}
                  {new Date(member.joined_at).toLocaleDateString('es', { year: 'numeric', month: 'long', day: 'numeric' })}
                </p>
              ) : null}
            </div>

            <Button className="w-full" size="sm" onClick={() => void handleSendDm()} disabled={dmSending}>
              <MessageCircle className="mr-2 size-4" />
              Enviar mensaje
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
