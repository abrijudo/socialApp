import { useEffect, useState } from 'react'
import { Check, Copy, LogOut, UserCircle, Settings, UserRoundPlus } from 'lucide-react'
import { toast } from 'sonner'
import { FriendManager } from '@/components/friends/FriendManager'
import { UserProfilePopup } from '@/components/modals/UserProfilePopup'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { USER_ACCOUNT_FOOTER_DOCK } from '@/lib/chatComposer'
import { LUX_ICON_STROKE, luxIconRow } from '@/lib/luxIcon'
import { useAppStore } from '@/store/useAppStore'
import { cn } from '@/lib/utils'
import type { UiTheme } from '@/lib/uiTheme'
import type { ProfileStatus } from '@/types/models'

const THEME_CHOICES: { id: UiTheme; label: string; swatch: string }[] = [
  { id: 'dark', label: 'Tema oscuro', swatch: 'oklch(0.64 0.15 280)' },
  { id: 'blue', label: 'Tema azul', swatch: 'oklch(0.66 0.13 240)' },
  { id: 'purple', label: 'Tema morado', swatch: 'oklch(0.66 0.24 300)' },
]

/** Anillo de presencia integrado en el avatar (menos ruido visual que un dot suelto). */
function presenceAvatarRingClass(status: ProfileStatus): string {
  if (status === 'online') return 'ring-2 ring-emerald-500/70 ring-offset-2 ring-offset-background'
  if (status === 'idle') return 'ring-2 ring-amber-400/65 ring-offset-2 ring-offset-background'
  if (status === 'dnd') return 'ring-2 ring-destructive/55 ring-offset-2 ring-offset-background'
  return 'ring-1 ring-border/70 ring-offset-2 ring-offset-background'
}

/**
 * Superficie única: borde suave, vidrio y hover — todo el bloque (incl. engranaje) comparte el mismo contenedor.
 */
const USER_PANEL_SURFACE =
  'group relative flex w-full min-w-0 min-h-0 flex-1 items-center gap-2.5 overflow-hidden rounded-[11px] border border-border/40 ' +
  'bg-[color-mix(in_oklch,var(--muted)_30%,transparent)] px-2 py-1.5 shadow-[inset_0_1px_0_0_color-mix(in_oklch,var(--foreground)_4%,transparent)] ' +
  'backdrop-blur-[10px] transition-[border-color,background-color,box-shadow] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] ' +
  'hover:border-border/60 hover:bg-[color-mix(in_oklch,var(--muted)_38%,transparent)] hover:shadow-[inset_0_1px_0_0_color-mix(in_oklch,var(--foreground)_6%,transparent)]'

/**
 * Pie de barra lateral — panel de usuario tipo producto: jerarquía clara, presencia en el avatar, menú integrado.
 */
export function UserAccountFooter({ className }: { className?: string }) {
  const profile = useAppStore((s) => s.profile)
  const username = useAppStore((s) => s.username)
  const userId = useAppStore((s) => s.userId)
  const logout = useAppStore((s) => s.logout)
  const uiTheme = useAppStore((s) => s.uiTheme)
  const setUiTheme = useAppStore((s) => s.setUiTheme)

  const [profileOpen, setProfileOpen] = useState(false)
  const [friendsOpen, setFriendsOpen] = useState(false)
  const [avatarBroken, setAvatarBroken] = useState(false)

  const displayName = profile?.display_name || profile?.username || username || 'Usuario'
  const handle = profile?.username ?? username ?? '…'
  const status: ProfileStatus = profile?.status ?? 'offline'
  const avatarUrl = profile?.avatar_url?.trim() || ''
  const showAvatarImg = Boolean(avatarUrl) && !avatarBroken
  const fullIdentityLabel = `${displayName} · @${handle}`

  useEffect(() => {
    setAvatarBroken(false)
  }, [avatarUrl])

  async function handleCopyUsername() {
    const text = typeof handle === 'string' && handle !== '…' ? handle : userId
    try {
      await navigator.clipboard.writeText(text)
      toast.success('Copiado al portapapeles')
    } catch {
      toast.error('No se pudo copiar')
    }
  }

  return (
    <>
      <footer
        className={cn(USER_ACCOUNT_FOOTER_DOCK, 'w-full min-w-0 px-2.5 sm:px-3', className)}
        aria-label="Tu cuenta"
      >
        <div className={USER_PANEL_SURFACE}>
          <div
            className={cn(
              'lux-avatar relative flex size-9 shrink-0 items-center justify-center overflow-hidden bg-gradient-to-br from-primary/28 via-primary/12 to-primary/5 text-sm font-semibold text-primary shadow-[inset_0_1px_0_0_color-mix(in_oklch,var(--foreground)_10%,transparent)]',
              presenceAvatarRingClass(status),
            )}
            aria-hidden
          >
            {showAvatarImg ? (
              <img
                src={avatarUrl}
                alt=""
                className="size-full object-cover"
                onError={() => setAvatarBroken(true)}
              />
            ) : (
              (profile?.display_name || profile?.username || '?').slice(0, 1).toUpperCase()
            )}
          </div>

          <div className="min-h-0 min-w-0 flex-1 py-px">
            <p
              className="text-foreground line-clamp-2 text-[0.8125rem] font-semibold leading-snug tracking-tight break-words"
              title={displayName}
            >
              {displayName}
            </p>
            <p
              className="text-muted-foreground mt-0.5 truncate font-mono text-[0.6875rem] font-medium leading-tight tracking-wide"
              title={`@${handle}`}
            >
              @{handle}
            </p>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={cn(
                  'size-8 shrink-0 rounded-lg text-muted-foreground opacity-85 transition-[opacity,background,color] duration-150',
                  'hover:bg-muted/55 hover:text-foreground hover:opacity-100',
                  'focus-visible:ring-2 focus-visible:ring-ring/45',
                )}
                title={fullIdentityLabel}
                aria-label="Cuenta y ajustes"
              >
                <Settings className={cn(luxIconRow, 'size-4')} strokeWidth={LUX_ICON_STROKE} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="top" className="w-56">
              <DropdownMenuLabel className="font-normal">
                <span className="text-foreground text-xs font-medium">Cuenta</span>
              </DropdownMenuLabel>
              <DropdownMenuItem
                onSelect={() => {
                  setProfileOpen(true)
                }}
              >
                <UserCircle className={cn(luxIconRow, 'size-4')} strokeWidth={LUX_ICON_STROKE} />
                Ver mi perfil
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => {
                  setFriendsOpen(true)
                }}
              >
                <UserRoundPlus className={cn(luxIconRow, 'size-4')} strokeWidth={LUX_ICON_STROKE} />
                Amigos
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void handleCopyUsername()}>
                <Copy className={cn(luxIconRow, 'size-4')} strokeWidth={LUX_ICON_STROKE} />
                Copiar nombre de usuario
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="font-normal">
                <span className="text-foreground text-xs font-medium">Apariencia</span>
              </DropdownMenuLabel>
              {THEME_CHOICES.map((opt) => (
                <DropdownMenuItem
                  key={opt.id}
                  onSelect={() => {
                    setUiTheme(opt.id)
                  }}
                  className="justify-between"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className="size-3.5 shrink-0 rounded-full border border-border shadow-inner"
                      style={{ background: opt.swatch }}
                      aria-hidden
                    />
                    <span className="truncate">{opt.label}</span>
                  </span>
                  {uiTheme === opt.id ? (
                    <Check className="text-primary size-4 shrink-0" strokeWidth={LUX_ICON_STROKE} aria-hidden />
                  ) : null}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => {
                  void logout()
                }}
              >
                <LogOut className={cn(luxIconRow, 'size-4')} strokeWidth={LUX_ICON_STROKE} />
                Cerrar sesión
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </footer>

      {userId ? (
        <UserProfilePopup open={profileOpen} onOpenChange={setProfileOpen} userId={userId} />
      ) : null}
      <FriendManager open={friendsOpen} onOpenChange={setFriendsOpen} />
    </>
  )
}
