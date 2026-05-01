import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { UI_THEME_STORAGE_KEY, type UiTheme, applyUiThemeToDocument, isUiTheme } from '@/lib/uiTheme'
import type { Session } from '@supabase/supabase-js'
import { ensureSupabaseSession, usernameFromSupabaseUser } from '@/lib/bootstrapSession'
import { registerSupabaseAuthListenerOnce } from '@/lib/supabaseAuthListener'
import {
  clearAuthenticatedRealtimeAuth,
  createSupabaseBrowserClient,
  getAuthenticatedSupabase,
  getSupabaseBrowserClient,
} from '@/lib/supabase'
import { apiGetJson, fetchBootstrap } from '@/lib/api'
import { getApiBaseUrl } from '@/lib/apiOrigin'
import { isElectronAppShell } from '@/lib/electron'
import { SOCIALAPP_USER_KEY } from '@/lib/constants'
import type {
  BootstrapPayload,
  Channel,
  ChannelMessage,
  DmChannelSummary,
  FriendsListResponse,
  FriendEntry,
  FriendshipListItem,
  Profile,
  Server,
  ServerMember,
  ServerRole,
  VoiceOccupantsByChannel,
} from '@/types/models'

function sortMessagesChronological(list: ChannelMessage[]): ChannelMessage[] {
  return [...list].sort((a, b) => {
    const ta = new Date(a.created_at).getTime()
    const tb = new Date(b.created_at).getTime()
    if (ta !== tb) return ta - tb
    return a.id.localeCompare(b.id)
  })
}

export type {
  Profile,
  ProfileStatus,
  Server,
  Channel,
  ServerMember,
  ChannelMessage,
  DmChannelSummary,
  FriendEntry,
  FriendshipListItem,
} from '@/types/models'

export interface AppState {
  userId: string
  username: string
  accessToken: string | null
  profile: Profile | null
  /** Servidor activo (misma fila que antes). */
  server: Server | null
  /** Lista de servidores; hoy el backend solo devuelve uno en bootstrap. */
  servers: Server[]
  activeServerId: string | null
  role: ServerRole
  members: ServerMember[]
  channels: Channel[]
  activeTextChannelId: string | null
  /** Canal de voz LiveKit activo (UUID del canal). */
  activeVoiceChannelId: string | null
  activeDmChannelId: string | null
  dmChannels: DmChannelSummary[]
  /**
   * Caché de mensajes por `channel_id` para que, al desmontar y remontar
   * `ChatArea` (p. ej. al entrar/salir de un canal de voz, o al cambiar de
   * canal de texto), los mensajes ya cargados no se pierdan ni se tengan que
   * volver a pedir con spinner. El hook `useChannelMessages` sigue
   * suscribiéndose a realtime y hace un fetch silencioso en background.
   */
  messagesByChannel: Record<string, ChannelMessage[]>
  /** Indicador de carga del historial por canal (en el primer fetch). */
  messagesLoadingByChannel: Record<string, boolean>
  /**
   * Caché de mensajes por `dm_channel_id`, análogo a `messagesByChannel` pero
   * para mensajes directos. Evita recargar el historial al volver a un DM.
   */
  dmMessagesByChannel: Record<string, ChannelMessage[]>
  /** Indicador de carga del historial por DM (primer fetch). */
  dmMessagesLoadingByChannel: Record<string, boolean>
  /** Quedan mensajes anteriores por cargar (scroll hacia arriba / cursor `before`). */
  messagesHasMoreByChannel: Record<string, boolean>
  dmMessagesHasMoreByChannel: Record<string, boolean>
  /** Cargando lote de mensajes viejos (infinite scroll inverso). */
  messagesLoadingOlderByChannel: Record<string, boolean>
  dmMessagesLoadingOlderByChannel: Record<string, boolean>
  channelsLoading: boolean
  membersLoading: boolean
  initialBootDone: boolean
  sessionInitializing: boolean
  sessionError: string | null
  needsUsername: boolean
  /** Presencia en tiempo real (Supabase Presence); no incluye offline. */
  onlineUsers: Record<string, 'online' | 'idle' | 'dnd'>
  /** Usuarios conectados por canal de voz (Supabase Presence `global_voice_presence`). */
  voiceChannelOccupants: VoiceOccupantsByChannel
  /** Estado local del micro para difundir mute en Presence de voz. */
  localVoiceMuted: boolean
  /** Estado local de cámara para difundirlo en Presence de voz. */
  localCameraEnabled: boolean
  /** Estado local de pantalla compartida para difundirlo en Presence de voz. */
  localScreenShareEnabled: boolean
  /** Estado local de speaking para resaltar el nombre en lista de voz. */
  localVoiceSpeaking: boolean
  /** IDs de participantes que hablan ahora mismo (LiveKit WebRTC, sin latencia). */
  livekitSpeakers: Record<string, boolean>
  /**
   * Volumen de salida por participante (LiveKit `identity` = `user_id`), 0–2 → 0–200 %.
   * Se aplica a mic y audio de pantalla; compartido entre lista de miembros y escenario de vídeo.
   */
  voiceParticipantVolume: Record<string, number>
  /** Panel de vídeo (escenario) visible cuando hay pistas de cámara/pantalla. */
  isVideoStageOpen: boolean
  /**
   * Pistas de vídeo reales en la sala (desde `VideoStageHost` bajo `LiveKitRoom`).
   * Permite a la columna de chat mostrar "Mostrar panel" sin `useTracks` allí.
   */
  voiceRoomHasRenderableVideo: boolean
  unreadCounts: Record<string, number>
  /** Suma de no leídos en DMs cuyo canal figura en `dmChannels` (badge Inicio en el rail). */
  unreadDmCount: number
  lastReadTimestamps: Record<string, string>
  /**
   * Línea de "nuevos mensajes": valor de `lastReadTimestamps[id]` en el instante
   * **antes** de `markChannelAsRead` al activar el canal/DM. Permite mostrar
   * el separador aunque el márcado como leído ya use `new Date()`.
   */
  viewEnterReadBaseline: Record<string, string | null>
  /**
   * Nombres de usuario que el Presence de Realtime reporta como “escribiendo”
   * (excluido el propio). Claves: `channel_id` de texto o `dm_channel_id`.
   */
  typingUsernamesByChannel: Record<string, string[]>
  /**
   * Mensaje al que se responde (mismo hilo o DM). `channel_id` del mensaje
   * debe coincidir con el canal o DM de texto activo.
   */
  replyingToMessage: ChannelMessage | null
  /**
   * Draft de mensaje en curso por canal/DM. Lo mantenemos en el store (en
   * vez de en el estado local de `ChatArea`/`DmChatArea`) para que al cambiar
   * de canal y volver no se pierda lo que se estaba escribiendo.
   * Las claves son UUIDs únicos entre `channels` y `dm_channels`.
   */
  drafts: Record<string, { body: string }>
  /** Amigos aceptados (GET /api/friends). */
  friends: FriendEntry[]
  /** Solicitudes pendientes entrantes y salientes. */
  pendingRequests: { incoming: FriendshipListItem[]; outgoing: FriendshipListItem[] }
  /** Carga de la lista de amigos/solicitudes. */
  friendsListLoading: boolean
  /** Paleta (variables CSS bajo `data-theme` en `html`). */
  uiTheme: UiTheme
  /** Micrófono preferido para voz (LiveKit); `null` = predeterminado del sistema (primer entrada enumerada). */
  preferredVoiceMicDeviceId: string | null
  /** Salida de audio de la sala (`setSinkId`); `null` = predeterminado. */
  preferredVoiceSpeakerDeviceId: string | null
}

export interface AppActions {
  initializeSession: (opts?: { interactiveUsername?: string }) => Promise<void>
  setSession: (patch: Partial<Pick<AppState, 'userId' | 'username' | 'accessToken'>>) => void
  /**
   * Mantiene `accessToken` y Realtime alineados con Supabase tras refresh de JWT o cierre de sesión.
   * Se usa desde `onAuthStateChange`; no llames a `signOut` desde aquí.
   */
  syncWithSupabaseSession: (session: Session | null) => void
  applyBootstrap: (payload: BootstrapPayload) => void
  setActiveTextChannelId: (id: string | null) => void
  setActiveVoiceChannelId: (id: string | null) => void
  setActiveServerId: (id: string | null) => void
  setActiveDmChannelId: (id: string | null) => void
  setDmChannels: (list: DmChannelSummary[]) => void
  /** GET /api/friends; actualiza `friends` y `pendingRequests`. */
  refreshFriends: () => Promise<void>
  /** Reemplaza la lista de mensajes de un canal; opcional `hasMore` (paginación inversa). */
  setChannelMessages: (
    channelId: string,
    messages: ChannelMessage[],
    options?: { hasMore?: boolean },
  ) => void
  /** Antepone un lote de mensajes más viejos (mismo `channel_id`), fusiona y ordena. */
  prependChannelMessages: (channelId: string, older: ChannelMessage[], hasMore: boolean) => void
  /** Añade un mensaje al canal (idempotente por `id`). */
  appendChannelMessage: (channelId: string, msg: ChannelMessage) => void
  /** Marca/desmarca el estado de carga del historial de un canal. */
  setChannelMessagesLoading: (channelId: string, loading: boolean) => void
  setDmChannelMessages: (
    dmChannelId: string,
    messages: ChannelMessage[],
    options?: { hasMore?: boolean },
  ) => void
  prependDmChannelMessages: (dmChannelId: string, older: ChannelMessage[], hasMore: boolean) => void
  /** Añade un mensaje al DM (idempotente por `id`). */
  appendDmChannelMessage: (dmChannelId: string, msg: ChannelMessage) => void
  /** Marca/desmarca el estado de carga del historial de un DM. */
  setDmChannelMessagesLoading: (dmChannelId: string, loading: boolean) => void
  setChannelMessagesLoadingOlder: (channelId: string, loading: boolean) => void
  setDmMessagesLoadingOlder: (dmChannelId: string, loading: boolean) => void
  /** Actualiza un mensaje en el canal donde se encuentre (búsqueda global). */
  updateMessage: (id: string, patch: Partial<ChannelMessage>) => void
  /** Elimina un mensaje del canal donde esté. */
  removeMessage: (id: string) => void
  updateDmMessage: (id: string, patch: Partial<ChannelMessage>) => void
  removeDmMessage: (id: string) => void
  setChannelsLoading: (v: boolean) => void
  setMembersLoading: (v: boolean) => void
  setOnlineUsers: (users: Record<string, 'online' | 'idle' | 'dnd'>) => void
  setVoiceChannelOccupants: (occupants: VoiceOccupantsByChannel) => void
  setLocalVoiceMuted: (muted: boolean) => void
  setLocalCameraEnabled: (enabled: boolean) => void
  setLocalScreenShareEnabled: (enabled: boolean) => void
  setLocalVoiceSpeaking: (speaking: boolean) => void
  setLivekitSpeakers: (speakers: Record<string, boolean>) => void
  setVoiceParticipantVolume: (userId: string, volume: number) => void
  setIsVideoStageOpen: (open: boolean) => void
  setVoiceRoomHasRenderableVideo: (v: boolean) => void
  markChannelAsRead: (channelId: string) => void
  incrementUnread: (channelId: string) => void
  resetApp: () => void
  /** Cierra sesión en Supabase y vuelve a la pantalla de nombre de usuario. */
  logout: () => Promise<void>
  /** Quita un canal de la lista y limpia selección si era el activo (p. ej. DELETE en tiempo real). */
  pruneDeletedChannel: (channelId: string) => void
  setDraftBody: (channelId: string, body: string) => void
  clearDraft: (channelId: string) => void
  setReplyingToMessage: (msg: ChannelMessage | null) => void
  /** Tras guardar perfil en API: actualiza `profile` y miembros con el mismo `user_id`. */
  applyProfileUpdate: (profile: Profile) => void
  setUiTheme: (theme: UiTheme) => void
  /** Lista de nombres mostrable para el indicador “escribiendo…” (Realtime). */
  setTypingUsernamesForChannel: (channelId: string, usernames: string[]) => void
  setPreferredVoiceMicDeviceId: (deviceId: string | null) => void
  setPreferredVoiceSpeakerDeviceId: (deviceId: string | null) => void
}

const initialState: AppState = {
  userId: '',
  username: '',
  accessToken: null,
  profile: null,
  server: null,
  servers: [],
  activeServerId: null,
  role: 'member',
  members: [],
  channels: [],
  activeTextChannelId: null,
  activeVoiceChannelId: null,
  activeDmChannelId: null,
  dmChannels: [],
  messagesByChannel: {},
  messagesLoadingByChannel: {},
  dmMessagesByChannel: {},
  dmMessagesLoadingByChannel: {},
  channelsLoading: false,
  membersLoading: false,
  initialBootDone: false,
  sessionInitializing: false,
  sessionError: null,
  needsUsername: false,
  onlineUsers: {},
  voiceChannelOccupants: {},
  localVoiceMuted: true,
  localCameraEnabled: false,
  localScreenShareEnabled: false,
  localVoiceSpeaking: false,
  livekitSpeakers: {},
  voiceParticipantVolume: {},
  isVideoStageOpen: true,
  voiceRoomHasRenderableVideo: false,
  unreadCounts: {},
  unreadDmCount: 0,
  lastReadTimestamps: loadLastReadTimestamps(),
  viewEnterReadBaseline: {},
  typingUsernamesByChannel: {},
  replyingToMessage: null,
  drafts: {},
  friends: [],
  pendingRequests: { incoming: [], outgoing: [] },
  friendsListLoading: false,
  uiTheme: 'dark' satisfies UiTheme,
  preferredVoiceMicDeviceId: null,
  preferredVoiceSpeakerDeviceId: null,
  messagesHasMoreByChannel: {},
  dmMessagesHasMoreByChannel: {},
  messagesLoadingOlderByChannel: {},
  dmMessagesLoadingOlderByChannel: {},
}

function loadLastReadTimestamps(): Record<string, string> {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem('sc_last_read') : null
    return raw ? (JSON.parse(raw) as Record<string, string>) : {}
  } catch {
    return {}
  }
}

function persistLastReadTimestamps(ts: Record<string, string>) {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('sc_last_read', JSON.stringify(ts))
    }
  } catch { /* quota exceeded or unavailable */ }
}

function pickDefaultTextChannelId(channels: Channel[]): string | null {
  const text = channels.find((c) => c?.type === 'text' && !c.is_archived)
  return text?.id ?? null
}

function computeUnreadDmCount(
  dmChannels: DmChannelSummary[],
  unreadCounts: Record<string, number>,
): number {
  return dmChannels.reduce((acc, d) => acc + (unreadCounts[d.id] ?? 0), 0)
}

/** Evita dos `initializeSession` en paralelo (p. ej. React Strict Mode) y el aviso de lock de gotrue. */
let sessionInitInFlight: Promise<void> | null = null

export const useAppStore = create<AppState & AppActions>()(
  persist(
    (set, get) => ({
      ...initialState,

      setUiTheme: (theme) => {
        set({ uiTheme: theme })
        applyUiThemeToDocument(theme)
      },

      setPreferredVoiceMicDeviceId: (deviceId) => set({ preferredVoiceMicDeviceId: deviceId }),

      setPreferredVoiceSpeakerDeviceId: (deviceId) =>
        set({ preferredVoiceSpeakerDeviceId: deviceId }),

      setTypingUsernamesForChannel: (channelId, usernames) => {
        if (!channelId) return
        set((s) => {
          const next = { ...s.typingUsernamesByChannel }
          if (usernames.length === 0) delete next[channelId]
          else next[channelId] = usernames
          return { typingUsernamesByChannel: next }
        })
      },

      initializeSession: async (opts) => {
        if (sessionInitInFlight) {
          return sessionInitInFlight
        }
        sessionInitInFlight = (async () => {
          set({
            sessionInitializing: true,
            sessionError: null,
          })
          try {
            if (isElectronAppShell() && !getApiBaseUrl().trim()) {
              set({
                sessionInitializing: false,
                needsUsername: false,
                initialBootDone: false,
                sessionError:
                  'Configuración incompleta: el origen del API no llegó desde Electron. Revisa `electron/main.mjs` (IPC `electron:sync-api-origin`) y `src/lib/apiOrigin.ts`.',
              })
              return
            }
            await createSupabaseBrowserClient()
            const sb = getSupabaseBrowserClient()

            const ensured = await ensureSupabaseSession(sb, {
              interactiveUsername: opts?.interactiveUsername,
            })

            registerSupabaseAuthListenerOnce((session) => {
              get().syncWithSupabaseSession(session)
            })

            if (ensured.kind === 'needs_username') {
              set({
                sessionInitializing: false,
                needsUsername: true,
                initialBootDone: false,
              })
              return
            }

            const { session, user, username } = ensured

            set({
              userId: user.id,
              accessToken: session.access_token,
              username,
              needsUsername: false,
              sessionError: null,
            })

            set({ channelsLoading: true, membersLoading: true })

            let bootstrap: BootstrapPayload
            try {
              bootstrap = await fetchBootstrap(session.access_token, username)
            } catch (err) {
              const msg = String((err as Error).message || '')
              if (/escogido|elige otro/i.test(msg)) {
                await sb.auth.signOut().catch(() => {})
                if (typeof localStorage !== 'undefined') {
                  localStorage.removeItem(SOCIALAPP_USER_KEY)
                }
                set({
                  userId: '',
                  accessToken: null,
                  username: '',
                  profile: null,
                  server: null,
                  servers: [],
                  activeServerId: null,
                  members: [],
                  channels: [],
                  messagesByChannel: {},
                  messagesLoadingByChannel: {},
                  dmMessagesByChannel: {},
                  dmMessagesLoadingByChannel: {},
                  activeTextChannelId: null,
                  activeVoiceChannelId: null,
                  initialBootDone: false,
                  sessionInitializing: false,
                  needsUsername: true,
                  sessionError: 'Ese nombre ya está en uso. Elige otro.',
                  onlineUsers: {},
                  localVoiceMuted: true,
                  localCameraEnabled: false,
                  localScreenShareEnabled: false,
                  localVoiceSpeaking: false,
                  isVideoStageOpen: true,
                  voiceRoomHasRenderableVideo: false,
                  channelsLoading: false,
                  membersLoading: false,
                  friends: [],
                  pendingRequests: { incoming: [], outgoing: [] },
                  friendsListLoading: false,
                  unreadDmCount: 0,
                })
                return
              }
              throw err
            }

            get().applyBootstrap(bootstrap)
            set({
              initialBootDone: true,
              sessionInitializing: false,
              sessionError: null,
              channelsLoading: false,
              membersLoading: false,
            })
          } catch (e) {
            let msg = (e as Error).message || 'Error al iniciar sesión'
            if (
              msg === 'Failed to fetch' &&
              typeof window !== 'undefined' &&
              (window.location.protocol === 'file:' || window.location.protocol === 'app:')
            ) {
              msg =
                'No se pudo contactar al servidor. Comprueba la red y que el backend responda (dev: API en http://localhost:3000; producción: URL en `apiOrigin.ts` / `main.mjs`).'
            }
            set({
              sessionError: msg,
              sessionInitializing: false,
              initialBootDone: false,
              channelsLoading: false,
              membersLoading: false,
            })
          }
        })()
        try {
          await sessionInitInFlight
        } finally {
          sessionInitInFlight = null
        }
      },

  setSession: (patch) => set((s) => ({ ...s, ...patch })),

  syncWithSupabaseSession: (session) => {
    if (session?.access_token && session.user) {
      const username = usernameFromSupabaseUser(session.user)
      set((s) => {
        if (
          s.accessToken === session.access_token &&
          s.userId === session.user!.id &&
          s.username === username
        ) {
          return {}
        }
        return {
          userId: session.user!.id,
          accessToken: session.access_token,
          username,
        }
      })
      void getAuthenticatedSupabase(session.access_token)
      return
    }

    const before = get()
    if (!before.accessToken && !before.userId) return

    void clearAuthenticatedRealtimeAuth()
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(SOCIALAPP_USER_KEY)
      }
    } catch {
      /* noop */
    }
    set({ ...initialState, needsUsername: true })
  },

  applyBootstrap: (payload) => {
    const server = payload.server && payload.server.id ? payload.server : null
    const channels = (payload.channels || []).filter(Boolean)
    const dmChannels = Array.isArray(payload.dmChannels)
      ? payload.dmChannels.filter(Boolean)
      : []
    set((s) => ({
      profile: payload.profile ?? null,
      server,
      servers: server ? [server] : [],
      activeServerId: server?.id ?? null,
      role: payload.membership?.role ?? 'member',
      members: Array.isArray(payload.members) ? payload.members.filter(Boolean) : [],
      channels,
      activeTextChannelId: pickDefaultTextChannelId(channels),
      activeVoiceChannelId: null,
      activeDmChannelId: null,
      messagesByChannel: {},
      messagesLoadingByChannel: {},
      messagesHasMoreByChannel: {},
      messagesLoadingOlderByChannel: {},
      dmMessagesByChannel: {},
      dmMessagesLoadingByChannel: {},
      dmMessagesHasMoreByChannel: {},
      dmMessagesLoadingOlderByChannel: {},
      typingUsernamesByChannel: {},
      replyingToMessage: null,
      dmChannels,
      voiceChannelOccupants: {},
      livekitSpeakers: {},
      voiceParticipantVolume: {},
      onlineUsers: {},
      localVoiceMuted: true,
      localCameraEnabled: false,
      localScreenShareEnabled: false,
      localVoiceSpeaking: false,
      isVideoStageOpen: true,
      voiceRoomHasRenderableVideo: false,
      friends: [],
      pendingRequests: { incoming: [], outgoing: [] },
      friendsListLoading: false,
      unreadDmCount: computeUnreadDmCount(dmChannels, s.unreadCounts),
    }))
  },

  refreshFriends: async () => {
    const { accessToken } = get()
    if (!accessToken) return
    set({ friendsListLoading: true })
    try {
      const data = await apiGetJson<FriendsListResponse>('/api/friends', accessToken)
      set({
        friends: data.friends ?? [],
        pendingRequests: {
          incoming: data.pendingIncoming ?? [],
          outgoing: data.pendingOutgoing ?? [],
        },
        friendsListLoading: false,
      })
    } catch {
      set({ friendsListLoading: false })
    }
  },

  setActiveTextChannelId: (activeTextChannelId) => {
    if (!activeTextChannelId) {
      set({ activeTextChannelId: null })
      return
    }
    set((s) => {
      const prev = s.lastReadTimestamps[activeTextChannelId] ?? null
      return {
        activeTextChannelId,
        activeDmChannelId: null,
        viewEnterReadBaseline: { ...s.viewEnterReadBaseline, [activeTextChannelId]: prev },
      }
    })
    get().markChannelAsRead(activeTextChannelId)
  },
  setActiveVoiceChannelId: (activeVoiceChannelId) =>
    set(() => ({
      activeVoiceChannelId,
      ...(activeVoiceChannelId == null
        ? {
            voiceParticipantVolume: {},
            voiceRoomHasRenderableVideo: false,
          }
        : {}),
    })),
  setActiveServerId: (activeServerId) =>
    set({
      activeServerId,
      ...(activeServerId != null ? { activeDmChannelId: null } : {}),
    }),
  setActiveDmChannelId: (activeDmChannelId) => {
    set((s) => {
      if (!activeDmChannelId) {
        return { activeDmChannelId: null }
      }
      const prev = s.lastReadTimestamps[activeDmChannelId] ?? null
      return {
        activeDmChannelId,
        activeTextChannelId: null,
        activeServerId: null,
        viewEnterReadBaseline: { ...s.viewEnterReadBaseline, [activeDmChannelId]: prev },
      }
    })
    if (activeDmChannelId) get().markChannelAsRead(activeDmChannelId)
  },
  setDmChannels: (dmChannels) =>
    set((s) => ({
      dmChannels,
      unreadDmCount: computeUnreadDmCount(dmChannels, s.unreadCounts),
    })),
  setChannelMessages: (channelId, messages, options) =>
    set((s) => {
      const messagesByChannel = { ...s.messagesByChannel, [channelId]: messages }
      if (options?.hasMore === undefined) return { messagesByChannel }
      return {
        messagesByChannel,
        messagesHasMoreByChannel: {
          ...s.messagesHasMoreByChannel,
          [channelId]: options.hasMore,
        },
      }
    }),
  prependChannelMessages: (channelId, older, hasMore) =>
    set((s) => {
      const cur = s.messagesByChannel[channelId] ?? []
      const byId = new Map<string, ChannelMessage>()
      for (const m of older) byId.set(m.id, m)
      for (const m of cur) if (!byId.has(m.id)) byId.set(m.id, m)
      const merged = sortMessagesChronological(Array.from(byId.values()))
      return {
        messagesByChannel: { ...s.messagesByChannel, [channelId]: merged },
        messagesHasMoreByChannel: { ...s.messagesHasMoreByChannel, [channelId]: hasMore },
      }
    }),
  appendChannelMessage: (channelId, msg) =>
    set((s) => {
      let list = s.messagesByChannel[channelId] ?? []
      if (list.some((m) => m.id === msg.id)) return {}
      // Quitar eco optimista (mismo autor/cuerpo/hilo) al llegar el id real o el INSERT realtime
      if (!msg.id.startsWith('__local__') && msg.author_id === s.userId) {
        list = list.filter(
          (m) =>
            !(
              m.id.startsWith('__local__') &&
              m.author_id === msg.author_id &&
              m.body === msg.body &&
              (m.parent_message_id ?? null) === (msg.parent_message_id ?? null)
            ),
        )
      }
      return {
        messagesByChannel: { ...s.messagesByChannel, [channelId]: [...list, msg] },
      }
    }),
  setChannelMessagesLoading: (channelId, loading) =>
    set((s) => {
      // Evita actualizaciones redundantes que generarían renders.
      if ((s.messagesLoadingByChannel[channelId] ?? false) === loading) return {}
      return {
        messagesLoadingByChannel: {
          ...s.messagesLoadingByChannel,
          [channelId]: loading,
        },
      }
    }),
  setDmChannelMessages: (dmChannelId, messages, options) =>
    set((s) => {
      const dmMessagesByChannel = { ...s.dmMessagesByChannel, [dmChannelId]: messages }
      if (options?.hasMore === undefined) return { dmMessagesByChannel }
      return {
        dmMessagesByChannel,
        dmMessagesHasMoreByChannel: {
          ...s.dmMessagesHasMoreByChannel,
          [dmChannelId]: options.hasMore,
        },
      }
    }),
  prependDmChannelMessages: (dmChannelId, older, hasMore) =>
    set((s) => {
      const cur = s.dmMessagesByChannel[dmChannelId] ?? []
      const byId = new Map<string, ChannelMessage>()
      for (const m of older) byId.set(m.id, m)
      for (const m of cur) if (!byId.has(m.id)) byId.set(m.id, m)
      const merged = sortMessagesChronological(Array.from(byId.values()))
      return {
        dmMessagesByChannel: { ...s.dmMessagesByChannel, [dmChannelId]: merged },
        dmMessagesHasMoreByChannel: { ...s.dmMessagesHasMoreByChannel, [dmChannelId]: hasMore },
      }
    }),
  appendDmChannelMessage: (dmChannelId, msg) =>
    set((s) => {
      let list = s.dmMessagesByChannel[dmChannelId] ?? []
      if (list.some((m) => m.id === msg.id)) return {}
      if (!msg.id.startsWith('__local__') && msg.author_id === s.userId) {
        list = list.filter(
          (m) =>
            !(
              m.id.startsWith('__local__') &&
              m.author_id === msg.author_id &&
              m.body === msg.body &&
              (m.parent_message_id ?? null) === (msg.parent_message_id ?? null)
            ),
        )
      }
      return {
        dmMessagesByChannel: {
          ...s.dmMessagesByChannel,
          [dmChannelId]: [...list, msg],
        },
      }
    }),
  setDmChannelMessagesLoading: (dmChannelId, loading) =>
    set((s) => {
      if ((s.dmMessagesLoadingByChannel[dmChannelId] ?? false) === loading) return {}
      return {
        dmMessagesLoadingByChannel: {
          ...s.dmMessagesLoadingByChannel,
          [dmChannelId]: loading,
        },
      }
    }),
  setChannelMessagesLoadingOlder: (channelId, loading) =>
    set((s) => {
      if ((s.messagesLoadingOlderByChannel[channelId] ?? false) === loading) return {}
      return {
        messagesLoadingOlderByChannel: {
          ...s.messagesLoadingOlderByChannel,
          [channelId]: loading,
        },
      }
    }),
  setDmMessagesLoadingOlder: (dmChannelId, loading) =>
    set((s) => {
      if ((s.dmMessagesLoadingOlderByChannel[dmChannelId] ?? false) === loading) return {}
      return {
        dmMessagesLoadingOlderByChannel: {
          ...s.dmMessagesLoadingOlderByChannel,
          [dmChannelId]: loading,
        },
      }
    }),
  updateMessage: (id, patch) =>
    set((s) => {
      for (const [chId, list] of Object.entries(s.messagesByChannel)) {
        const idx = list.findIndex((m) => m.id === id)
        if (idx >= 0) {
          const updated = list.slice()
          updated[idx] = { ...updated[idx], ...patch }
          return {
            messagesByChannel: { ...s.messagesByChannel, [chId]: updated },
          }
        }
      }
      return {}
    }),
  removeMessage: (id) =>
    set((s) => {
      for (const [chId, list] of Object.entries(s.messagesByChannel)) {
        if (list.some((m) => m.id === id)) {
          return {
            messagesByChannel: {
              ...s.messagesByChannel,
              [chId]: list.filter((m) => m.id !== id),
            },
          }
        }
      }
      return {}
    }),
  updateDmMessage: (id, patch) =>
    set((s) => {
      for (const [dmId, list] of Object.entries(s.dmMessagesByChannel)) {
        const idx = list.findIndex((m) => m.id === id)
        if (idx >= 0) {
          const updated = list.slice()
          updated[idx] = { ...updated[idx], ...patch }
          return {
            dmMessagesByChannel: { ...s.dmMessagesByChannel, [dmId]: updated },
          }
        }
      }
      return {}
    }),
  removeDmMessage: (id) =>
    set((s) => {
      for (const [dmId, list] of Object.entries(s.dmMessagesByChannel)) {
        if (list.some((m) => m.id === id)) {
          return {
            dmMessagesByChannel: {
              ...s.dmMessagesByChannel,
              [dmId]: list.filter((m) => m.id !== id),
            },
          }
        }
      }
      return {}
    }),

  setChannelsLoading: (channelsLoading) => set({ channelsLoading }),
  setMembersLoading: (membersLoading) => set({ membersLoading }),

  setOnlineUsers: (onlineUsers) =>
    set((s) => {
      // Shallow-equal: evitamos cambiar la referencia (y por tanto re-renderizar
      // suscriptores como `MembersList`) si el diccionario llega igual. El
      // canal de presencia emite `sync`/`join`/`leave` con mucha frecuencia y
      // muchas veces sin cambios reales.
      const prev = s.onlineUsers
      const prevKeys = Object.keys(prev)
      const nextKeys = Object.keys(onlineUsers)
      if (prevKeys.length === nextKeys.length) {
        let equal = true
        for (const k of nextKeys) {
          if (prev[k] !== onlineUsers[k]) {
            equal = false
            break
          }
        }
        if (equal) return {}
      }
      return { onlineUsers }
    }),

  setVoiceChannelOccupants: (voiceChannelOccupants) => set({ voiceChannelOccupants }),

  setLocalVoiceMuted: (localVoiceMuted) => set({ localVoiceMuted }),
  setLocalCameraEnabled: (localCameraEnabled) => set({ localCameraEnabled }),
  setLocalScreenShareEnabled: (localScreenShareEnabled) => set({ localScreenShareEnabled }),
  setLocalVoiceSpeaking: (localVoiceSpeaking) => set({ localVoiceSpeaking }),

  setLivekitSpeakers: (livekitSpeakers) =>
    set((s) => {
      // Shallow-equal: `activeSpeakersChanged` de LiveKit dispara varias veces
      // por segundo aunque no cambie el conjunto de hablantes. Evitamos
      // re-renderizar consumidores si no hay diferencia real.
      const prev = s.livekitSpeakers
      const prevKeys = Object.keys(prev)
      const nextKeys = Object.keys(livekitSpeakers)
      if (prevKeys.length === nextKeys.length) {
        let equal = true
        for (const k of nextKeys) {
          if (prev[k] !== livekitSpeakers[k]) {
            equal = false
            break
          }
        }
        if (equal) return {}
      }
      return { livekitSpeakers }
    }),
  setVoiceParticipantVolume: (userId, volume) =>
    set((s) => {
      const v = Math.max(0, Math.min(2, volume))
      const prev = s.voiceParticipantVolume[userId]
      if (prev === v) return {}
      return {
        voiceParticipantVolume: { ...s.voiceParticipantVolume, [userId]: v },
      }
    }),
  setIsVideoStageOpen: (isVideoStageOpen) => set({ isVideoStageOpen }),
  setVoiceRoomHasRenderableVideo: (voiceRoomHasRenderableVideo) => set({ voiceRoomHasRenderableVideo }),

  markChannelAsRead: (channelId) =>
    set((s) => {
      const ts = { ...s.lastReadTimestamps, [channelId]: new Date().toISOString() }
      persistLastReadTimestamps(ts)
      const counts = { ...s.unreadCounts }
      delete counts[channelId]
      return {
        unreadCounts: counts,
        lastReadTimestamps: ts,
        unreadDmCount: computeUnreadDmCount(s.dmChannels, counts),
      }
    }),
  incrementUnread: (channelId) =>
    set((s) => {
      const unreadCounts = {
        ...s.unreadCounts,
        [channelId]: (s.unreadCounts[channelId] ?? 0) + 1,
      }
      return {
        unreadCounts,
        unreadDmCount: computeUnreadDmCount(s.dmChannels, unreadCounts),
      }
    }),

  resetApp: () =>
    set((s) => ({
      ...initialState,
      uiTheme: s.uiTheme,
      preferredVoiceMicDeviceId: s.preferredVoiceMicDeviceId,
      preferredVoiceSpeakerDeviceId: s.preferredVoiceSpeakerDeviceId,
    })),

  logout: async () => {
    const sb = getSupabaseBrowserClient()
    await sb.auth.signOut().catch(() => {})
    await clearAuthenticatedRealtimeAuth()
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(SOCIALAPP_USER_KEY)
      }
    } catch {
      /* noop */
    }
    set((s) => ({
      ...initialState,
      needsUsername: true,
      uiTheme: s.uiTheme,
      preferredVoiceMicDeviceId: s.preferredVoiceMicDeviceId,
      preferredVoiceSpeakerDeviceId: s.preferredVoiceSpeakerDeviceId,
    }))
  },

  pruneDeletedChannel: (channelId) =>
    set((s) => {
      const nextMessagesByChannel = { ...s.messagesByChannel }
      delete nextMessagesByChannel[channelId]
      const nextMessagesLoading = { ...s.messagesLoadingByChannel }
      delete nextMessagesLoading[channelId]
      const nextDrafts = { ...s.drafts }
      delete nextDrafts[channelId]
      const nextTyping = { ...s.typingUsernamesByChannel }
      delete nextTyping[channelId]
      const clearReply =
        s.replyingToMessage?.channel_id === channelId ? { replyingToMessage: null } : {}
      return {
        ...clearReply,
        channels: s.channels.filter((c) => c.id !== channelId),
        messagesByChannel: nextMessagesByChannel,
        messagesLoadingByChannel: nextMessagesLoading,
        drafts: nextDrafts,
        typingUsernamesByChannel: nextTyping,
        activeTextChannelId: s.activeTextChannelId === channelId ? null : s.activeTextChannelId,
        activeVoiceChannelId: s.activeVoiceChannelId === channelId ? null : s.activeVoiceChannelId,
      }
    }),

  setDraftBody: (channelId, body) =>
    set((s) => {
      if (!channelId) return {}
      const prev = s.drafts[channelId]
      if (!body) {
        if (!prev) return {}
        const next = { ...s.drafts }
        delete next[channelId]
        return { drafts: next }
      }
      if (prev && prev.body === body) return {}
      return { drafts: { ...s.drafts, [channelId]: { body } } }
    }),

  setReplyingToMessage: (msg) => set({ replyingToMessage: msg }),

  clearDraft: (channelId) =>
    set((s) => {
      if (!channelId || !(channelId in s.drafts)) return {}
      const next = { ...s.drafts }
      delete next[channelId]
      return { drafts: next }
    }),

  applyProfileUpdate: (nextProfile) =>
    set((s) => {
      if (s.userId !== nextProfile.user_id) return {}
      const members = s.members.map((m) =>
        m.user_id === nextProfile.user_id ? { ...m, profile: nextProfile } : m,
      )
      return {
        profile: nextProfile,
        username: nextProfile.username || s.username,
        members,
      }
    }),
    }),
    {
      name: UI_THEME_STORAGE_KEY,
      partialize: (s) => ({
        uiTheme: s.uiTheme,
        preferredVoiceMicDeviceId: s.preferredVoiceMicDeviceId,
        preferredVoiceSpeakerDeviceId: s.preferredVoiceSpeakerDeviceId,
      }),
      storage: createJSONStorage(() => localStorage),
      version: 0,
      merge: (persisted, current) => {
        const c = current as AppState
        if (!persisted || typeof persisted !== 'object') {
          return c as never
        }
        const p = persisted as Partial<AppState>
        const mic =
          typeof p.preferredVoiceMicDeviceId === 'string' || p.preferredVoiceMicDeviceId === null
            ? p.preferredVoiceMicDeviceId
            : c.preferredVoiceMicDeviceId
        const spk =
          typeof p.preferredVoiceSpeakerDeviceId === 'string' || p.preferredVoiceSpeakerDeviceId === null
            ? p.preferredVoiceSpeakerDeviceId
            : c.preferredVoiceSpeakerDeviceId
        return {
          ...c,
          ...p,
          uiTheme: isUiTheme(p.uiTheme) ? p.uiTheme : c.uiTheme,
          preferredVoiceMicDeviceId: mic,
          preferredVoiceSpeakerDeviceId: spk,
        } as never
      },
    },
  ),
)
