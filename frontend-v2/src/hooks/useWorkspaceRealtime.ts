import { useEffect } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { apiGetJson } from '@/lib/api'
import { getAuthenticatedSupabase, getSupabaseBrowserClient } from '@/lib/supabase'
import { useAppStore } from '@/store/useAppStore'
import type { Channel, Profile, Server, ServerMember } from '@/types/models'

function sortChannels(list: Channel[]): Channel[] {
  return [...list].sort((a, b) => {
    const byPosition = a.position - b.position
    if (byPosition !== 0) return byPosition
    return a.created_at.localeCompare(b.created_at)
  })
}

function profileFromRow(row: Record<string, unknown>): Profile | null {
  const userId = String(row.user_id ?? '').trim()
  if (!userId) return null
  return {
    user_id: userId,
    username: String(row.username ?? '').trim(),
    display_name: String(row.display_name ?? '').trim(),
    avatar_url: row.avatar_url == null ? null : String(row.avatar_url),
    bio: String(row.bio ?? ''),
    status: (String(row.status || 'offline') as Profile['status']) || 'offline',
    updated_at: row.updated_at == null ? undefined : String(row.updated_at),
    last_login: row.last_login == null ? null : String(row.last_login),
  }
}

function memberFromRow(
  row: Record<string, unknown>,
  serverId: string,
  existingProfile?: Profile | null,
): ServerMember | null {
  const userId = String(row.user_id ?? '').trim()
  if (!userId) return null
  return {
    server_id: String(row.server_id ?? serverId),
    user_id: userId,
    role: (String(row.role || 'member') as ServerMember['role']) || 'member',
    joined_at: String(row.joined_at ?? new Date().toISOString()),
    profile: existingProfile ?? null,
  }
}

/**
 * Sincronización estructural global del workspace activo:
 * canales, servidor y miembros/perfiles en tiempo real.
 */
export function useWorkspaceRealtime() {
  const accessToken = useAppStore((s) => s.accessToken)
  const activeServerId = useAppStore((s) => s.activeServerId)

  useEffect(() => {
    if (!accessToken || !activeServerId) return

    let cancelled = false
    let channel: RealtimeChannel | null = null
    let membersRefreshTimer: ReturnType<typeof setTimeout> | null = null
    let membersRefreshInFlight = false
    let lastMembersRefreshAt = 0

    const refreshMembers = async () => {
      if (cancelled || !accessToken || !activeServerId || membersRefreshInFlight) return
      membersRefreshInFlight = true
      try {
        const members = await apiGetJson<ServerMember[]>(
          `/api/servers/${encodeURIComponent(activeServerId)}/members`,
          accessToken,
        )
        if (cancelled) return
        useAppStore.setState({ members: Array.isArray(members) ? members : [] })
        lastMembersRefreshAt = Date.now()
      } catch (e) {
        console.warn('workspace realtime: fallo al resincronizar miembros', e)
      } finally {
        membersRefreshInFlight = false
      }
    }

    const scheduleMembersRefresh = (delayMs = 250) => {
      if (cancelled) return
      if (membersRefreshTimer) clearTimeout(membersRefreshTimer)
      membersRefreshTimer = setTimeout(() => {
        void refreshMembers()
      }, delayMs)
    }

    void (async () => {
      try {
        const supabase = await getAuthenticatedSupabase(accessToken)
        if (cancelled) return

        channel = supabase
          .channel(`workspace_sync:${activeServerId}`)
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'channels',
              filter: `server_id=eq.${activeServerId}`,
            },
            (payload) => {
              const row = payload.new as Channel
              if (!row?.id) return
              useAppStore.setState((state) => {
                const exists = state.channels.some((c) => c.id === row.id)
                const next = exists
                  ? state.channels.map((c) => (c.id === row.id ? { ...c, ...row } : c))
                  : [...state.channels, row]
                return { channels: sortChannels(next) }
              })
            },
          )
          .on(
            'postgres_changes',
            {
              event: 'UPDATE',
              schema: 'public',
              table: 'channels',
              filter: `server_id=eq.${activeServerId}`,
            },
            (payload) => {
              const row = payload.new as Channel
              if (!row?.id) return
              useAppStore.setState((state) => ({
                channels: sortChannels(
                  state.channels.map((c) => (c.id === row.id ? { ...c, ...row } : c)),
                ),
              }))
            },
          )
          .on(
            'postgres_changes',
            {
              event: 'DELETE',
              schema: 'public',
              table: 'channels',
              filter: `server_id=eq.${activeServerId}`,
            },
            (payload) => {
              const id = (payload.old as { id?: string })?.id
              if (!id) return
              useAppStore.setState((state) => ({
                channels: state.channels.filter((c) => c.id !== id),
                activeTextChannelId:
                  state.activeTextChannelId === id ? null : state.activeTextChannelId,
                activeVoiceChannelId:
                  state.activeVoiceChannelId === id ? null : state.activeVoiceChannelId,
              }))
            },
          )
          .on(
            'postgres_changes',
            {
              event: 'UPDATE',
              schema: 'public',
              table: 'servers',
              filter: `id=eq.${activeServerId}`,
            },
            (payload) => {
              const row = payload.new as Server
              if (!row?.id) return
              useAppStore.setState((state) => ({
                server: state.server?.id === row.id ? { ...state.server, ...row } : state.server,
                servers: state.servers.map((s) => (s.id === row.id ? { ...s, ...row } : s)),
              }))
            },
          )
          .on(
            'postgres_changes',
            {
              event: 'DELETE',
              schema: 'public',
              table: 'servers',
              filter: `id=eq.${activeServerId}`,
            },
            (payload) => {
              const id = (payload.old as { id?: string })?.id
              if (!id) return
              useAppStore.setState((state) => {
                if (state.activeServerId !== id) return state
                return {
                  server: null,
                  servers: state.servers.filter((s) => s.id !== id),
                  activeServerId: null,
                  activeTextChannelId: null,
                  activeVoiceChannelId: null,
                  channels: [],
                  members: [],
                }
              })
            },
          )
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'server_members',
              filter: `server_id=eq.${activeServerId}`,
            },
            (payload) => {
              const row = payload.new as Record<string, unknown>
              const userId = String(row.user_id ?? '').trim()
              if (!userId) return
              useAppStore.setState((state) => {
                const profile =
                  state.members.find((m) => m.user_id === userId)?.profile ??
                  (state.profile?.user_id === userId ? state.profile : null)
                const nextMember = memberFromRow(row, activeServerId, profile)
                if (!nextMember) return state
                const exists = state.members.some((m) => m.user_id === userId)
                const members = exists
                  ? state.members.map((m) => (m.user_id === userId ? { ...m, ...nextMember } : m))
                  : [...state.members, nextMember]
                return { members }
              })
              scheduleMembersRefresh(200)
            },
          )
          .on(
            'postgres_changes',
            {
              event: 'UPDATE',
              schema: 'public',
              table: 'server_members',
              filter: `server_id=eq.${activeServerId}`,
            },
            (payload) => {
              const row = payload.new as Partial<ServerMember> & { user_id?: string }
              const userId = String(row.user_id ?? '').trim()
              if (!userId) return
              useAppStore.setState((state) => ({
                members: state.members.map((m) =>
                  m.user_id === userId
                    ? {
                        ...m,
                        role: row.role ?? m.role,
                        joined_at: row.joined_at ?? m.joined_at,
                      }
                    : m,
                ),
              }))
              scheduleMembersRefresh(300)
            },
          )
          .on(
            'postgres_changes',
            {
              event: 'DELETE',
              schema: 'public',
              table: 'server_members',
              filter: `server_id=eq.${activeServerId}`,
            },
            (payload) => {
              const userId = String((payload.old as { user_id?: string })?.user_id ?? '').trim()
              if (!userId) return
              useAppStore.setState((state) => ({
                members: state.members.filter((m) => m.user_id !== userId),
              }))
              scheduleMembersRefresh(200)
            },
          )
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'profiles',
            },
            (payload) => {
              const profile = profileFromRow(payload.new as Record<string, unknown>)
              if (!profile) return
              useAppStore.setState((state) => ({
                members: state.members.map((m) =>
                  m.user_id === profile.user_id ? { ...m, profile } : m,
                ),
                profile:
                  state.profile?.user_id === profile.user_id
                    ? { ...state.profile, ...profile }
                    : state.profile,
              }))
              const now = Date.now()
              if (now - lastMembersRefreshAt > 2_000) {
                scheduleMembersRefresh(250)
              }
            },
          )
          .on(
            'postgres_changes',
            {
              event: 'UPDATE',
              schema: 'public',
              table: 'profiles',
            },
            (payload) => {
              const profile = profileFromRow(payload.new as Record<string, unknown>)
              if (!profile) return
              useAppStore.setState((state) => ({
                members: state.members.map((m) =>
                  m.user_id === profile.user_id
                    ? { ...m, profile: { ...(m.profile || {}), ...profile } as Profile }
                    : m,
                ),
                profile:
                  state.profile?.user_id === profile.user_id
                    ? { ...state.profile, ...profile }
                    : state.profile,
              }))
              const now = Date.now()
              if (now - lastMembersRefreshAt > 2_000) {
                scheduleMembersRefresh(250)
              }
            },
          )

        channel.subscribe((status, err) => {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.warn('workspace realtime:', status, err ?? '')
            scheduleMembersRefresh(350)
          }
        })
      } catch (e) {
        console.warn('No se pudo iniciar workspace realtime:', e)
        scheduleMembersRefresh(400)
      }
    })()

    const heartbeat = setInterval(() => {
      void refreshMembers()
    }, 20_000)

    return () => {
      cancelled = true
      clearInterval(heartbeat)
      if (membersRefreshTimer) clearTimeout(membersRefreshTimer)
      const ch = channel
      if (!ch) return
      const supabase = getSupabaseBrowserClient()
      void supabase.removeChannel(ch)
    }
  }, [accessToken, activeServerId])
}

