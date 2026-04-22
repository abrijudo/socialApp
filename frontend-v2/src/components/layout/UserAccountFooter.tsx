import { useState } from 'react'
import { Copy, LogOut, UserCircle, Settings, UserRoundPlus } from 'lucide-react'
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

/** Pie de barra lateral: avatar, nombre y menú (mismo layout en DMs y en servidor). */
export function UserAccountFooter({ className }: { className?: string }) {
  const profile = useAppStore((s) => s.profile)
  const username = useAppStore((s) => s.username)
  const userId = useAppStore((s) => s.userId)
  const logout = useAppStore((s) => s.logout)

  const [profileOpen, setProfileOpen] = useState(false)
  const [friendsOpen, setFriendsOpen] = useState(false)

  const displayName = profile?.display_name || profile?.username || username || 'Usuario'
  const handle = profile?.username ?? username ?? '…'

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
        className={cn(USER_ACCOUNT_FOOTER_DOCK, 'w-full min-w-0 px-3 sm:px-4', className)}
      >
        <div className="flex h-full min-w-0 flex-1 items-center gap-3">
          <div
            className="from-primary/20 to-primary/5 text-primary lux-avatar flex size-8 shrink-0 items-center justify-center bg-gradient-to-br text-xs font-semibold"
            aria-hidden
          >
            {(profile?.display_name || profile?.username || '?').slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 min-h-0 flex-1">
            <div className="truncate text-xs font-semibold leading-tight tracking-tight">{displayName}</div>
            <div className="text-muted-foreground mt-0.5 truncate text-[0.65rem] leading-tight tracking-wide">
              @{handle}
            </div>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="lux-icon-button text-muted-foreground hover:text-foreground size-8 shrink-0"
                title="Cuenta y ajustes"
                aria-label="Menú de cuenta y ajustes"
              >
                <Settings className={cn(luxIconRow, 'size-4')} strokeWidth={LUX_ICON_STROKE} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="top" className="w-52">
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
