import { useMemo, useState } from 'react'
import { Hash, MicOff, Plus, UserPlus, Video, Volume2 } from 'lucide-react'
import { UserAccountFooter } from '@/components/layout/UserAccountFooter'
import { VoiceSidebarDock } from '@/components/voice/VoiceSidebarDock'
import { CreateChannelModal } from '@/components/modals/CreateChannelModal'
import { InviteModal } from '@/components/modals/InviteModal'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useMobileNav } from '@/components/layout/MobileNavContext'
import { LUX_ICON_STROKE, luxIconRow, luxIconSm } from '@/lib/luxIcon'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store/useAppStore'
import type { Profile } from '@/types/models'

/** Columna de canales de texto/voz del servidor activo. */
export function ServerSidebar() {
  const mobile = useMobileNav()
  const server = useAppStore((s) => s.server)
  const role = useAppStore((s) => s.role)
  const channels = useAppStore((s) => s.channels)
  const activeTextChannelId = useAppStore((s) => s.activeTextChannelId)
  const activeVoiceChannelId = useAppStore((s) => s.activeVoiceChannelId)
  const inVoice = Boolean(activeVoiceChannelId)
  const setActiveTextChannelId = useAppStore((s) => s.setActiveTextChannelId)
  const setActiveVoiceChannelId = useAppStore((s) => s.setActiveVoiceChannelId)
  const userId = useAppStore((s) => s.userId)
  const profile = useAppStore((s) => s.profile)
  const username = useAppStore((s) => s.username)
  const members = useAppStore((s) => s.members)
  const localVoiceMuted = useAppStore((s) => s.localVoiceMuted)
  const localCameraEnabled = useAppStore((s) => s.localCameraEnabled)
  const localScreenShareEnabled = useAppStore((s) => s.localScreenShareEnabled)
  const localVoiceSpeaking = useAppStore((s) => s.localVoiceSpeaking)
  const livekitSpeakers = useAppStore((s) => s.livekitSpeakers)
  const channelsLoading = useAppStore((s) => s.channelsLoading)
  const voiceChannelOccupants = useAppStore((s) => s.voiceChannelOccupants)
  const unreadCounts = useAppStore((s) => s.unreadCounts)

  const [isCreateChannelOpen, setIsCreateChannelOpen] = useState(false)
  const [channelTypeToCreate, setChannelTypeToCreate] = useState<'text' | 'voice'>('text')
  const [isInviteOpen, setIsInviteOpen] = useState(false)

  const serverId = server?.id ?? ''
  const canCreateChannel = role === 'owner'
  const currentUsername =
    (typeof profile?.username === 'string' && profile.username.trim()) ||
    (typeof username === 'string' && username.trim()) ||
    (typeof profile?.display_name === 'string' && profile.display_name.trim()) ||
    ''

  const textChannels = useMemo(() => channels.filter((c) => c.type === 'text' && !c.is_archived), [channels])
  const voiceChannels = useMemo(() => channels.filter((c) => c.type === 'voice' && !c.is_archived), [channels])
  const profileByUserId = useMemo(() => {
    const map = new Map<string, Profile>()
    for (const member of members) {
      if (!member?.user_id || !member.profile) continue
      map.set(member.user_id, member.profile)
    }
    if (profile?.user_id) {
      map.set(profile.user_id, profile)
    }
    return map
  }, [members, profile])

  function openCreateChannel(type: 'text' | 'voice') {
    setChannelTypeToCreate(type)
    setIsCreateChannelOpen(true)
  }

  function closeNavSheet() {
    mobile?.setNavSheetOpen(false)
  }

  return (
    <nav
      className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden"
      aria-label="Canales"
    >
      <header className="border-b border-white/[0.05] bg-foreground/[0.02] shadow-[inset_0_-1px_0_0_oklch(0_0_0/0.08)] flex h-12 shrink-0 items-center gap-2 px-3 sm:px-4">
        <h1 className="text-foreground/90 min-w-0 flex-1 truncate text-[0.72rem] font-medium tracking-tight sm:text-[0.75rem]">
          {server?.name ?? 'Servidor'}
        </h1>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="lux-icon-button size-8 shrink-0"
          title="Invitar personas"
          aria-label="Invitar personas"
          disabled={!serverId}
          onClick={() => setIsInviteOpen(true)}
        >
          <UserPlus className={cn(luxIconRow, 'size-4')} strokeWidth={LUX_ICON_STROKE} aria-hidden />
        </Button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-3 pt-3 pb-0">
        {channelsLoading ? (
          <div className="space-y-px px-0 py-0" aria-busy="true" aria-label="Cargando canales">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full rounded-md" />
            ))}
          </div>
        ) : (
          <>
            <section aria-labelledby="label-text-ch">
              <div className="flex items-center justify-between gap-2 px-0 pb-1">
                <h2
                  id="label-text-ch"
                  className="text-muted-foreground/95 text-[10px] font-semibold tracking-[0.14em] uppercase"
                >
                  Texto
                </h2>
                {canCreateChannel ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="lux-icon-button text-muted-foreground size-6 shrink-0"
                    title="Crear canal de texto"
                    aria-label="Crear canal de texto"
                    onClick={() => openCreateChannel('text')}
                  >
                    <Plus className={cn(luxIconSm, 'size-3.5')} strokeWidth={LUX_ICON_STROKE} aria-hidden />
                  </Button>
                ) : null}
              </div>
              <ul className="space-y-px">
                {textChannels.map((ch) => {
                  const active = ch.id === activeTextChannelId
                  const unread = unreadCounts[ch.id] ?? 0
                  return (
                    <li key={ch.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setActiveTextChannelId(ch.id)
                          closeNavSheet()
                        }}
                        className={cn(
                          'group/channel flex w-full items-center gap-3 rounded-[0.5rem] border border-transparent px-2.5 py-2 text-left text-[0.75rem] font-medium sm:text-[0.78rem]',
                          'lux-transition [transition-property:color,background-color,border-color,box-shadow,transform] hover:border-border/50 hover:bg-background/30 hover:shadow-[inset_0_1px_0_0_oklch(1_0_0/0.04)] active:scale-[0.99]',
                          active
                            ? 'border-primary/30 bg-primary/12 text-foreground font-semibold shadow-[inset_0_0_0_1px_oklch(0.62_0.12_280/0.2),inset_0_1px_0_0_oklch(1_0_0/0.08)]'
                            : unread > 0
                              ? 'text-foreground font-semibold'
                              : 'text-muted-foreground hover:text-foreground/95',
                        )}
                      >
                        <Hash
                          className={cn(
                            luxIconRow,
                            'size-4 shrink-0 opacity-70 transition-[opacity,transform,filter] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover/channel:scale-[1.04] group-hover/channel:opacity-100 group-hover/channel:text-foreground/90',
                          )}
                          strokeWidth={LUX_ICON_STROKE}
                          aria-hidden
                        />
                        <span className="min-w-0 flex-1 truncate">{ch.name}</span>
                        {unread > 0 && !active ? (
                          <span className="bg-primary/90 text-primary-foreground flex size-5 shrink-0 items-center justify-center rounded-md text-[10px] font-bold tabular-nums shadow-[0_0_0_1px_oklch(1_0_0/0.1)]">
                            {unread > 99 ? '99+' : unread}
                          </span>
                        ) : null}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </section>

            <section aria-labelledby="label-voice-ch">
              <div className="flex items-center justify-between gap-2 px-0 pb-1">
                <h2
                  id="label-voice-ch"
                  className="text-muted-foreground/95 text-[10px] font-semibold tracking-[0.14em] uppercase"
                >
                  Voz
                </h2>
                {canCreateChannel ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="lux-icon-button text-muted-foreground size-6 shrink-0"
                    title="Crear canal de voz"
                    aria-label="Crear canal de voz"
                    onClick={() => openCreateChannel('voice')}
                  >
                    <Plus className={cn(luxIconSm, 'size-3.5')} strokeWidth={LUX_ICON_STROKE} aria-hidden />
                  </Button>
                ) : null}
              </div>
              <ul className="space-y-px">
                {voiceChannels.map((ch) => {
                  const voiceActive = ch.id === activeVoiceChannelId
                  const voiceOccupants = voiceChannelOccupants?.[ch.id] || []
                  // Lógica optimista: si estoy en este canal pero Presence aún no me listó,
                  // me agrego localmente para feedback inmediato en el sidebar.
                  const showLocalInActive =
                    voiceActive &&
                    typeof userId === 'string' &&
                    userId.length > 0 &&
                    !voiceOccupants.some((u) => u.userId === userId)
                  const visibleUsers = showLocalInActive
                    ? [
                        ...voiceOccupants,
                        {
                          userId,
                          username: currentUsername || userId.slice(0, 8),
                          isMuted: localVoiceMuted,
                          isCameraOn: localCameraEnabled,
                          isScreenSharing: localScreenShareEnabled,
                          isSpeaking: localVoiceSpeaking,
                        },
                      ]
                    : voiceOccupants
                  return (
                    <li key={ch.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setActiveVoiceChannelId(ch.id)
                          closeNavSheet()
                        }}
                        className={cn(
                          'group/channel flex w-full items-center gap-3 rounded-[0.5rem] border border-transparent px-2.5 py-2 text-left text-[0.75rem] font-medium sm:text-[0.78rem]',
                          'lux-transition [transition-property:color,background-color,border-color,box-shadow,transform] hover:border-border/50 hover:bg-background/30 hover:shadow-[inset_0_1px_0_0_oklch(1_0_0/0.04)] active:scale-[0.99]',
                          voiceActive
                            ? 'border-primary/25 bg-primary/10 text-foreground font-semibold shadow-[inset_0_0_0_1px_oklch(0.62_0.12_280/0.18),inset_0_1px_0_0_oklch(1_0_0/0.08)]'
                            : 'text-muted-foreground hover:text-foreground/95',
                        )}
                      >
                        <Volume2
                          className={cn(
                            luxIconRow,
                            'size-4 shrink-0 opacity-70 transition-[opacity,transform,filter] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover/channel:scale-[1.04] group-hover/channel:opacity-100 group-hover/channel:text-foreground/90',
                          )}
                          strokeWidth={LUX_ICON_STROKE}
                          aria-hidden
                        />
                        <span className="truncate">{ch.name}</span>
                      </button>
                      {visibleUsers.length > 0 ? (
                        <ul className="mt-0.5 flex flex-col gap-0.5 pr-2 pl-5" aria-label={`En voz: ${ch.name}`}>
                          {visibleUsers.map((u) => {
                            const isSelf = u.userId === userId
                            const userProfile = profileByUserId.get(u.userId)
                            const displayName =
                              (typeof userProfile?.username === 'string' && userProfile.username.trim()) ||
                              u.username ||
                              'Usuario'
                            return (
                            <li key={u.userId}>
                              <div
                                className={cn(
                                  'text-muted-foreground flex items-center gap-3 rounded-md px-2 py-1.5 text-[0.75rem] font-medium sm:text-[0.78rem]',
                                  'lux-transition [transition-property:color,background-color,transform] hover:bg-background/25 hover:text-foreground/95',
                                )}
                              >
                                <div className="bg-primary/20 lux-avatar flex size-8 shrink-0 items-center justify-center">
                                  {userProfile?.avatar_url ? (
                                    <img
                                      src={userProfile.avatar_url}
                                      alt=""
                                      className="h-full w-full object-cover"
                                      loading="lazy"
                                    />
                                  ) : (
                                    <span className="text-primary text-[10px] font-semibold uppercase">
                                      {displayName.slice(0, 1)}
                                    </span>
                                  )}
                                </div>
                                <span
                                  className={cn(
                                    'min-w-0 truncate',
                                    (livekitSpeakers[u.userId] || (u.userId === userId && localVoiceSpeaking))
                                      ? 'text-emerald-400'
                                      : 'text-white',
                                  )}
                                >
                                  {displayName}
                                </span>
                                {u.isScreenSharing ? (
                                  <span className="shrink-0 rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-white">
                                    Transmitiendo
                                  </span>
                                ) : null}
                                {u.isCameraOn ? (
                                  <Video
                                    className={cn(luxIconSm, 'text-muted-foreground size-3.5 shrink-0 opacity-90')}
                                    strokeWidth={LUX_ICON_STROKE}
                                    aria-label="Cámara activa"
                                  />
                                ) : null}
                                {u.isMuted ? (
                                  <MicOff
                                    className={cn(luxIconSm, 'text-muted-foreground size-3.5 shrink-0 opacity-90')}
                                    strokeWidth={LUX_ICON_STROKE}
                                    aria-label="Usuario muteado"
                                  />
                                ) : null}
                                {isSelf ? (
                                  <span className="text-primary/90 shrink-0 text-[10px] font-semibold uppercase">
                                    tú
                                  </span>
                                ) : null}
                              </div>
                            </li>
                            )
                          })}
                        </ul>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            </section>
          </>
        )}
      </div>

      {inVoice ? (
        <div className="shrink-0">
          <VoiceSidebarDock />
        </div>
      ) : null}

      <UserAccountFooter />

      <CreateChannelModal
        isOpen={isCreateChannelOpen}
        onClose={() => setIsCreateChannelOpen(false)}
        serverId={serverId}
        defaultType={channelTypeToCreate}
      />
      <InviteModal
        isOpen={isInviteOpen}
        onClose={() => setIsInviteOpen(false)}
        serverId={serverId}
      />
    </nav>
  )
}
