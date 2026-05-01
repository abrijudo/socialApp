import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronRight,
  Copy,
  Headphones,
  LogOut,
  Mic,
  Server,
  Settings,
  UserCircle,
  UserRoundPlus,
} from 'lucide-react'
import { Room } from 'livekit-client'
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
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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

function fingerprintDeviceId(deviceId: string): string {
  const t = deviceId.trim()
  if (!t) return '?'
  if (t.length <= 8) return t
  return `${t.slice(0, 6)}…`
}

function formatMicrophoneLabel(device: MediaDeviceInfo, index: number): string {
  const lbl = device.label?.trim() ?? ''
  return lbl.length > 0 ? lbl : `Micrófono (${fingerprintDeviceId(device.deviceId) || `#${index + 1}`})`
}

function formatSpeakerLabel(device: MediaDeviceInfo, index: number): string {
  const lbl = device.label?.trim() ?? ''
  return lbl.length > 0 ? lbl : `Salida (${fingerprintDeviceId(device.deviceId) || `#${index + 1}`})`
}

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
  const preferredVoiceMicDeviceId = useAppStore((s) => s.preferredVoiceMicDeviceId)
  const preferredVoiceSpeakerDeviceId = useAppStore((s) => s.preferredVoiceSpeakerDeviceId)
  const setPreferredVoiceMicDeviceId = useAppStore((s) => s.setPreferredVoiceMicDeviceId)
  const setPreferredVoiceSpeakerDeviceId = useAppStore((s) => s.setPreferredVoiceSpeakerDeviceId)

  const [profileOpen, setProfileOpen] = useState(false)
  const [friendsOpen, setFriendsOpen] = useState(false)
  const [avatarBroken, setAvatarBroken] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [serverSettingsOpen, setServerSettingsOpen] = useState(false)
  const [audioInputs, setAudioInputs] = useState<MediaDeviceInfo[]>([])
  const [audioOutputs, setAudioOutputs] = useState<MediaDeviceInfo[]>([])
  const warmMicEnumerateRef = useRef(false)

  const refreshAudioHardware = useCallback(async () => {
    try {
      const inputs = await Room.getLocalDevices('audioinput', !warmMicEnumerateRef.current)
      warmMicEnumerateRef.current = true
      const outputs = await Room.getLocalDevices('audiooutput', false)
      setAudioInputs(inputs)
      setAudioOutputs(outputs)
    } catch (e) {
      console.warn('[UserAccountFooter] No se pudieron enumerar dispositivos de audio:', e)
    }
  }, [])

  useEffect(() => {
    if (!menuOpen) {
      setServerSettingsOpen(false)
    }
  }, [menuOpen])

  useEffect(() => {
    if (!menuOpen || !serverSettingsOpen) return undefined
    const nv = navigator.mediaDevices
    if (!nv?.addEventListener) return undefined
    const sync = (): void => {
      void refreshAudioHardware()
    }
    nv.addEventListener('devicechange', sync)
    return () => nv.removeEventListener('devicechange', sync)
  }, [menuOpen, serverSettingsOpen, refreshAudioHardware])

  const displayName = profile?.display_name || profile?.username || username || 'Usuario'
  const handle = profile?.username ?? username ?? '…'
  const status: ProfileStatus = profile?.status ?? 'offline'
  const avatarUrl = profile?.avatar_url?.trim() || ''
  const showAvatarImg = Boolean(avatarUrl) && !avatarBroken

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

  const micSelectValue = useMemo((): string => {
    if (preferredVoiceMicDeviceId == null) return '__default__'
    if (audioInputs.some((d) => d.deviceId === preferredVoiceMicDeviceId)) return preferredVoiceMicDeviceId
    return '__default__'
  }, [preferredVoiceMicDeviceId, audioInputs])

  const speakerSelectValue = useMemo((): string => {
    if (preferredVoiceSpeakerDeviceId == null) return '__default__'
    if (audioOutputs.some((d) => d.deviceId === preferredVoiceSpeakerDeviceId)) return preferredVoiceSpeakerDeviceId
    return '__default__'
  }, [preferredVoiceSpeakerDeviceId, audioOutputs])

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

          <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen} modal={false}>
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
                title="Ajustes"
                aria-label="Ajustes"
              >
                <Settings className={cn(luxIconRow, 'size-4')} strokeWidth={LUX_ICON_STROKE} aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="top" className="min-w-52">
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
              <DropdownMenuSub
                onOpenChange={(open) => {
                  setServerSettingsOpen(open)
                  if (open) void refreshAudioHardware()
                }}
              >
                <DropdownMenuSubTrigger className="gap-2 pr-2">
                  <Server className={cn(luxIconRow, 'size-4 shrink-0')} strokeWidth={LUX_ICON_STROKE} aria-hidden />
                  <span className="min-w-0 flex-1 truncate font-medium text-foreground">Ajustes de servidor</span>
                  <ChevronRight className="text-muted-foreground size-4 shrink-0 opacity-80" aria-hidden />
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent
                  sideOffset={8}
                  alignOffset={-4}
                  className="min-w-[min(94vw,20rem)] max-w-[min(96vw,26rem)] overflow-visible p-0"
                >
                  <div
                    className="flex flex-col gap-3 px-2.5 py-2.5"
                    onPointerDown={(e) => {
                      e.stopPropagation()
                    }}
                  >
                    <div className="space-y-1.5">
                      <p className="text-muted-foreground px-0.5 text-[0.6875rem] font-semibold uppercase tracking-wide">
                        Apariencia
                      </p>
                      <Select value={uiTheme} onValueChange={(v) => setUiTheme(v as UiTheme)}>
                        <SelectTrigger
                          size="sm"
                          className="h-9 w-full min-w-0 border-border/80 bg-background/80"
                          aria-label="Tema visual"
                        >
                          <SelectValue placeholder="Elige tema" />
                        </SelectTrigger>
                        <SelectContent position="popper" sideOffset={8} align="start" className="z-[300]">
                          {THEME_CHOICES.map((opt) => (
                            <SelectItem key={opt.id} value={opt.id}>
                              <span className="flex items-center gap-2">
                                <span
                                  className="size-3 shrink-0 rounded-full border border-border shadow-inner"
                                  style={{ background: opt.swatch }}
                                  aria-hidden
                                />
                                {opt.label}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1.5">
                      <p className="text-muted-foreground flex items-center gap-1.5 px-0.5 text-[0.6875rem] font-semibold uppercase tracking-wide">
                        <Mic
                          className={cn(luxIconRow, 'size-3.5 opacity-90')}
                          strokeWidth={LUX_ICON_STROKE}
                          aria-hidden
                        />
                        Micrófono
                      </p>
                      <Select
                        value={micSelectValue}
                        onValueChange={(v) => setPreferredVoiceMicDeviceId(v === '__default__' ? null : v)}
                      >
                        <SelectTrigger
                          size="sm"
                          className="h-9 w-full min-w-0 border-border/80 bg-background/80"
                          aria-label="Micrófono"
                        >
                          <SelectValue placeholder="Elegir micrófono" />
                        </SelectTrigger>
                        <SelectContent
                          position="popper"
                          sideOffset={8}
                          align="start"
                          className="z-[300] max-h-[min(50vh,280px)]"
                        >
                          <SelectItem value="__default__">Predeterminado del sistema</SelectItem>
                          {audioInputs
                            .filter((d) => d.deviceId.trim().length > 0)
                            .map((dev, idx) => (
                              <SelectItem key={dev.deviceId} value={dev.deviceId}>
                                {formatMicrophoneLabel(dev, idx)}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {audioOutputs.length > 0 ? (
                      <div className="space-y-1.5">
                        <p className="text-muted-foreground flex items-center gap-1.5 px-0.5 text-[0.6875rem] font-semibold uppercase tracking-wide">
                          <Headphones
                            className={cn(luxIconRow, 'size-3.5 opacity-90')}
                            strokeWidth={LUX_ICON_STROKE}
                            aria-hidden
                          />
                          Altavoz · auriculares
                        </p>
                        <Select
                          value={speakerSelectValue}
                          onValueChange={(v) => setPreferredVoiceSpeakerDeviceId(v === '__default__' ? null : v)}
                        >
                          <SelectTrigger
                            size="sm"
                            className="h-9 w-full min-w-0 border-border/80 bg-background/80"
                            aria-label="Salida de audio"
                          >
                            <SelectValue placeholder="Elegir altavoz o auriculares" />
                          </SelectTrigger>
                          <SelectContent
                            position="popper"
                            sideOffset={8}
                            align="start"
                            className="z-[300] max-h-[min(50vh,280px)]"
                          >
                            <SelectItem value="__default__">Predeterminado del sistema</SelectItem>
                            {audioOutputs
                              .filter((d) => d.deviceId.trim().length > 0)
                              .map((dev, idx) => (
                                <SelectItem key={dev.deviceId} value={dev.deviceId}>
                                  {formatSpeakerLabel(dev, idx)}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ) : (
                      <p className="text-muted-foreground px-0.5 text-[0.7rem] leading-snug">
                        Salida de audio: no se listan dispositivos en este entorno.
                      </p>
                    )}
                  </div>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
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
