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
  messages: ChannelMessage[]
  dmMessages: ChannelMessage[]
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
  /** Panel de vídeo (escenario) visible cuando hay pistas de cámara/pantalla. */
  isVideoStageOpen: boolean
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
  setMessages: (messages: ChannelMessage[]) => void
  setDmMessages: (messages: ChannelMessage[]) => void
  setChannelsLoading: (v: boolean) => void
  setMembersLoading: (v: boolean) => void
  setOnlineUsers: (users: Record<string, 'online' | 'idle' | 'dnd'>) => void
  setVoiceChannelOccupants: (occupants: VoiceOccupantsByChannel) => void
  setLocalVoiceMuted: (muted: boolean) => void
  setLocalCameraEnabled: (enabled: boolean) => void
  setLocalScreenShareEnabled: (enabled: boolean) => void
  setLocalVoiceSpeaking: (speaking: boolean) => void
  setLivekitSpeakers: (speakers: Record<string, boolean>) => void
  setIsVideoStageOpen: (open: boolean) => void
  resetApp: () => void
  /** Quita un canal de la lista y limpia selección si era el activo (p. ej. DELETE en tiempo real). */
  pruneDeletedChannel: (channelId: string) => void
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
  messages: [],
  dmMessages: [],
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
  isVideoStageOpen: true,
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
            dmMessages: [],
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
      set({
        sessionError: (e as Error).message || 'Error al iniciar sesión',
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
      messages: [],
      dmMessages: [],
      dmChannels: [],
      voiceChannelOccupants: {},
      livekitSpeakers: {},
      onlineUsers: {},
      localVoiceMuted: true,
      localCameraEnabled: false,
      localScreenShareEnabled: false,
      localVoiceSpeaking: false,
      isVideoStageOpen: true,
    })
  },

  setActiveTextChannelId: (activeTextChannelId) =>
    set({
      activeTextChannelId,
      ...(activeTextChannelId != null ? { activeDmChannelId: null } : {}),
    }),
  setActiveVoiceChannelId: (activeVoiceChannelId) => set({ activeVoiceChannelId }),
  setActiveServerId: (activeServerId) =>
    set({
      activeServerId,
      ...(activeServerId != null ? { activeDmChannelId: null } : {}),
    }),
  setActiveDmChannelId: (activeDmChannelId) =>
    set({
      activeDmChannelId,
      ...(activeDmChannelId != null ? { activeTextChannelId: null } : {}),
    }),
  setDmChannels: (dmChannels) => set({ dmChannels }),
  setMessages: (messages) => set({ messages }),
  setDmMessages: (dmMessages) => set({ dmMessages }),

  setChannelsLoading: (channelsLoading) => set({ channelsLoading }),
  setMembersLoading: (membersLoading) => set({ membersLoading }),

  setOnlineUsers: (onlineUsers) => set({ onlineUsers }),

  setVoiceChannelOccupants: (voiceChannelOccupants) => set({ voiceChannelOccupants }),

  setLocalVoiceMuted: (localVoiceMuted) => set({ localVoiceMuted }),
  setLocalCameraEnabled: (localCameraEnabled) => set({ localCameraEnabled }),
  setLocalScreenShareEnabled: (localScreenShareEnabled) => set({ localScreenShareEnabled }),
  setLocalVoiceSpeaking: (localVoiceSpeaking) => set({ localVoiceSpeaking }),

  setLivekitSpeakers: (livekitSpeakers) => set({ livekitSpeakers }),
  setIsVideoStageOpen: (isVideoStageOpen) => set({ isVideoStageOpen }),

  resetApp: () => set(initialState),

  pruneDeletedChannel: (channelId) =>
    set((s) => ({
      channels: s.channels.filter((c) => c.id !== channelId),
      messages: s.activeTextChannelId === channelId ? [] : s.messages,
      activeTextChannelId: s.activeTextChannelId === channelId ? null : s.activeTextChannelId,
      activeVoiceChannelId: s.activeVoiceChannelId === channelId ? null : s.activeVoiceChannelId,
    })),
}))
