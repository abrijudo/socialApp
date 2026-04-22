import { create } from 'zustand'
import { createSupabaseBrowserClient, getSupabaseBrowserClient } from '@/lib/supabase'
import { ensureSupabaseSession } from '@/lib/bootstrapSession'
import { fetchBootstrap } from '@/lib/api'
import { SOCIALAPP_USER_KEY } from '@/lib/constants'
import type {
  BootstrapPayload,
  Channel,
  ChannelMessage,
  DmChannelSummary,
  Profile,
  Server,
  ServerMember,
  ServerRole,
  VoiceOccupantsByChannel,
} from '@/types/models'

export type {
  Profile,
  ProfileStatus,
  Server,
  Channel,
  ServerMember,
  ChannelMessage,
  DmChannelSummary,
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
  unreadCounts: Record<string, number>
  lastReadTimestamps: Record<string, string>
  /**
   * Draft de mensaje en curso por canal/DM. Lo mantenemos en el store (en
   * vez de en el estado local de `ChatArea`/`DmChatArea`) para que al cambiar
   * de canal y volver no se pierda lo que se estaba escribiendo, y para que
   * el `parentMessageId` de la respuesta sea siempre del canal correcto.
   * Las claves son UUIDs únicos entre `channels` y `dm_channels`.
   */
  drafts: Record<string, { body: string; replyToId: string | null }>
}

export interface AppActions {
  initializeSession: (opts?: { interactiveUsername?: string }) => Promise<void>
  setSession: (patch: Partial<Pick<AppState, 'userId' | 'username' | 'accessToken'>>) => void
  applyBootstrap: (payload: BootstrapPayload) => void
  setActiveTextChannelId: (id: string | null) => void
  setActiveVoiceChannelId: (id: string | null) => void
  setActiveServerId: (id: string | null) => void
  setActiveDmChannelId: (id: string | null) => void
  setDmChannels: (list: DmChannelSummary[]) => void
  /** Reemplaza completamente la lista de mensajes cacheada de un canal. */
  setChannelMessages: (channelId: string, messages: ChannelMessage[]) => void
  /** Añade un mensaje al canal (idempotente por `id`). */
  appendChannelMessage: (channelId: string, msg: ChannelMessage) => void
  /** Marca/desmarca el estado de carga del historial de un canal. */
  setChannelMessagesLoading: (channelId: string, loading: boolean) => void
  /** Reemplaza completamente la lista de mensajes cacheada de un DM. */
  setDmChannelMessages: (dmChannelId: string, messages: ChannelMessage[]) => void
  /** Añade un mensaje al DM (idempotente por `id`). */
  appendDmChannelMessage: (dmChannelId: string, msg: ChannelMessage) => void
  /** Marca/desmarca el estado de carga del historial de un DM. */
  setDmChannelMessagesLoading: (dmChannelId: string, loading: boolean) => void
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
  markChannelAsRead: (channelId: string) => void
  incrementUnread: (channelId: string) => void
  resetApp: () => void
  /** Cierra sesión en Supabase y vuelve a la pantalla de nombre de usuario. */
  logout: () => Promise<void>
  /** Quita un canal de la lista y limpia selección si era el activo (p. ej. DELETE en tiempo real). */
  pruneDeletedChannel: (channelId: string) => void
  setDraftBody: (channelId: string, body: string) => void
  setDraftReply: (channelId: string, replyToId: string | null) => void
  clearDraft: (channelId: string) => void
  /** Tras guardar perfil en API: actualiza `profile` y miembros con el mismo `user_id`. */
  applyProfileUpdate: (profile: Profile) => void
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
  unreadCounts: {},
  lastReadTimestamps: loadLastReadTimestamps(),
  drafts: {},
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

export const useAppStore = create<AppState & AppActions>((set, get) => ({
  ...initialState,

  initializeSession: async (opts) => {
    set({
      sessionInitializing: true,
      sessionError: null,
    })
    try {
      await createSupabaseBrowserClient()
      const sb = getSupabaseBrowserClient()

      const ensured = await ensureSupabaseSession(sb, {
        interactiveUsername: opts?.interactiveUsername,
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
            channelsLoading: false,
            membersLoading: false,
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
        window.location.protocol === 'file:'
      ) {
        msg =
          'No se pudo contactar al servidor. En la app de escritorio debes definir VITE_API_ORIGIN (URL pública de tu backend) al ejecutar el build, por ejemplo en frontend-v2/.env.production.'
      }
      set({
        sessionError: msg,
        sessionInitializing: false,
        initialBootDone: false,
        channelsLoading: false,
        membersLoading: false,
      })
    }
  },

  setSession: (patch) => set((s) => ({ ...s, ...patch })),

  applyBootstrap: (payload) => {
    const server = payload.server && payload.server.id ? payload.server : null
    const channels = (payload.channels || []).filter(Boolean)
    const dmChannels = Array.isArray(payload.dmChannels)
      ? payload.dmChannels.filter(Boolean)
      : []
    set({
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
      dmMessagesByChannel: {},
      dmMessagesLoadingByChannel: {},
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
    })
  },

  setActiveTextChannelId: (activeTextChannelId) => {
    set({
      activeTextChannelId,
      ...(activeTextChannelId != null ? { activeDmChannelId: null } : {}),
    })
    if (activeTextChannelId) get().markChannelAsRead(activeTextChannelId)
  },
  setActiveVoiceChannelId: (activeVoiceChannelId) =>
    set(() => ({
      activeVoiceChannelId,
      ...(activeVoiceChannelId == null ? { voiceParticipantVolume: {} } : {}),
    })),
  setActiveServerId: (activeServerId) =>
    set({
      activeServerId,
      ...(activeServerId != null ? { activeDmChannelId: null } : {}),
    }),
  setActiveDmChannelId: (activeDmChannelId) => {
    set({
      activeDmChannelId,
      // Al activar un DM salimos del servidor/canal de texto, pero no del
      // canal de voz: LiveKit sigue vivo hasta colgar o cerrar pestaña.
      ...(activeDmChannelId != null
        ? { activeTextChannelId: null, activeServerId: null }
        : {}),
    })
    if (activeDmChannelId) get().markChannelAsRead(activeDmChannelId)
  },
  setDmChannels: (dmChannels) => set({ dmChannels }),
  setChannelMessages: (channelId, messages) =>
    set((s) => ({
      messagesByChannel: { ...s.messagesByChannel, [channelId]: messages },
    })),
  appendChannelMessage: (channelId, msg) =>
    set((s) => {
      const list = s.messagesByChannel[channelId] ?? []
      if (list.some((m) => m.id === msg.id)) return {}
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
  setDmChannelMessages: (dmChannelId, messages) =>
    set((s) => ({
      dmMessagesByChannel: { ...s.dmMessagesByChannel, [dmChannelId]: messages },
    })),
  appendDmChannelMessage: (dmChannelId, msg) =>
    set((s) => {
      const list = s.dmMessagesByChannel[dmChannelId] ?? []
      if (list.some((m) => m.id === msg.id)) return {}
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

  markChannelAsRead: (channelId) =>
    set((s) => {
      const ts = { ...s.lastReadTimestamps, [channelId]: new Date().toISOString() }
      persistLastReadTimestamps(ts)
      const counts = { ...s.unreadCounts }
      delete counts[channelId]
      return { unreadCounts: counts, lastReadTimestamps: ts }
    }),
  incrementUnread: (channelId) =>
    set((s) => ({
      unreadCounts: { ...s.unreadCounts, [channelId]: (s.unreadCounts[channelId] ?? 0) + 1 },
    })),

  resetApp: () => set(initialState),

  logout: async () => {
    const sb = getSupabaseBrowserClient()
    await sb.auth.signOut().catch(() => {})
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(SOCIALAPP_USER_KEY)
      }
    } catch {
      /* noop */
    }
    set({
      ...initialState,
      needsUsername: true,
    })
  },

  pruneDeletedChannel: (channelId) =>
    set((s) => {
      const nextMessagesByChannel = { ...s.messagesByChannel }
      delete nextMessagesByChannel[channelId]
      const nextMessagesLoading = { ...s.messagesLoadingByChannel }
      delete nextMessagesLoading[channelId]
      const nextDrafts = { ...s.drafts }
      delete nextDrafts[channelId]
      return {
        channels: s.channels.filter((c) => c.id !== channelId),
        messagesByChannel: nextMessagesByChannel,
        messagesLoadingByChannel: nextMessagesLoading,
        drafts: nextDrafts,
        activeTextChannelId: s.activeTextChannelId === channelId ? null : s.activeTextChannelId,
        activeVoiceChannelId: s.activeVoiceChannelId === channelId ? null : s.activeVoiceChannelId,
      }
    }),

  setDraftBody: (channelId, body) =>
    set((s) => {
      if (!channelId) return {}
      const prev = s.drafts[channelId]
      // Si el draft queda vacío y no hay respuesta pendiente, lo eliminamos
      // para no dejar basura en el diccionario.
      if (!body && !prev?.replyToId) {
        if (!prev) return {}
        const next = { ...s.drafts }
        delete next[channelId]
        return { drafts: next }
      }
      const nextEntry = { body, replyToId: prev?.replyToId ?? null }
      if (prev && prev.body === nextEntry.body && prev.replyToId === nextEntry.replyToId) {
        return {}
      }
      return { drafts: { ...s.drafts, [channelId]: nextEntry } }
    }),

  setDraftReply: (channelId, replyToId) =>
    set((s) => {
      if (!channelId) return {}
      const prev = s.drafts[channelId]
      if (!prev?.body && !replyToId) {
        if (!prev) return {}
        const next = { ...s.drafts }
        delete next[channelId]
        return { drafts: next }
      }
      const nextEntry = { body: prev?.body ?? '', replyToId }
      if (prev && prev.body === nextEntry.body && prev.replyToId === nextEntry.replyToId) {
        return {}
      }
      return { drafts: { ...s.drafts, [channelId]: nextEntry } }
    }),

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
}))
