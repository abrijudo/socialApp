export type ProfileStatus = 'online' | 'idle' | 'dnd' | 'offline'

export type ServerRole = 'owner' | 'admin' | 'mod' | 'member'

export interface Profile {
  user_id: string
  username: string
  display_name: string
  avatar_url: string | null
  bio: string
  status: ProfileStatus
  updated_at?: string
  last_login?: string | null
}

export interface Server {
  id: string
  name: string
  created_by: string
  created_at: string
}

export interface Channel {
  id: string
  server_id: string
  type: 'text' | 'voice'
  name: string
  position: number
  is_archived: boolean
  created_by: string
  created_at: string
}

export interface ServerMember {
  server_id: string
  user_id: string
  role: ServerRole
  joined_at: string
  profile: Profile | null
}

export interface ChannelMessage {
  id: string
  channel_id: string
  author_id: string
  body: string
  created_at: string
  edited_at: string | null
  message_type: string
  media_data?: string | null
  media_mime?: string | null
  media_name?: string | null
  media_duration_ms?: number | null
  parent_message_id?: string | null
  profiles?: Profile | null
  reactions?: { userId: string; emoji: string }[]
  replyCount?: number
}

export interface DmChannelSummary {
  id: string
  otherUser: (Profile & { user_id: string }) | null
}

/** Respuesta de GET /api/bootstrap */
export interface BootstrapPayload {
  profile: Profile
  server: Server
  membership: { role: ServerRole }
  members: ServerMember[]
  channels: Channel[]
  /** Misma forma que GET /api/dm; incluido en el bootstrap para un solo round-trip. */
  dmChannels?: DmChannelSummary[]
}

export type PresenceStatus = 'online' | 'idle' | 'dnd'

export type PresencePayload = {
  user_id?: string
  status?: string
}

export type VoiceChannelOccupant = {
  userId: string
  username: string
  isMuted?: boolean
  isScreenSharing?: boolean
  isCameraOn?: boolean
  isSpeaking?: boolean
}

export type VoiceOccupantsByChannel = Record<string, VoiceChannelOccupant[]>

export type VoicePresenceRow = {
  user_id?: string
  username?: string
  voiceChannelId?: string | null
  muted?: boolean
  screenShareEnabled?: boolean
  cameraEnabled?: boolean
  speaking?: boolean
}

export type VoiceParticipantsSnapshot = {
  byChannel?: Record<
    string,
    Array<{
      identity?: string
      name?: string
      hasScreenShare?: boolean
      hasCamera?: boolean
      isSpeaking?: boolean
    }>
  >
}

export type ChannelMessagesResponse = { messages: ChannelMessage[]; hasMore: boolean }

/** Fila de amistad / solicitud (GET /api/friends) */
export type FriendshipListItem = {
  friendshipId: string
  user: Profile
  createdAt: string
  status: 'pending' | 'accepted'
}

export type FriendEntry = FriendshipListItem & { since: string }

/** Respuesta GET /api/friends */
export type FriendsListResponse = {
  friends: FriendEntry[]
  pendingIncoming: FriendshipListItem[]
  pendingOutgoing: FriendshipListItem[]
}

export type LiveKitTokenResponse = {
  token: string
  url: string
}
