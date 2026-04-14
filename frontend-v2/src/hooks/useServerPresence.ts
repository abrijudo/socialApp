import { useEffect } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { getAuthenticatedSupabase, getSupabaseBrowserClient } from '@/lib/supabase'
import { useAppStore } from '@/store/useAppStore'
import type { PresencePayload, PresenceStatus } from '@/types/models'

export type { PresenceStatus } from '@/types/models'

function isPresenceStatus(s: string): s is PresenceStatus {
  return s === 'online' || s === 'idle' || s === 'dnd'
}

/** Convierte `channel.presenceState()` al diccionario del store. */
function presenceStateToOnlineUsers(
  state: Record<string, PresencePayload[]>,
): Record<string, PresenceStatus> {
  const out: Record<string, PresenceStatus> = {}
  for (const presences of Object.values(state)) {
    if (!Array.isArray(presences) || presences.length === 0) continue
    const raw = presences[0]
    const uid = raw?.user_id
    const st = raw?.status
    if (uid && typeof st === 'string' && isPresenceStatus(st)) {
      out[uid] = st
    }
  }
  return out
}

function pushPresenceToStore(
  channel: { presenceState: () => unknown },
  setOnlineUsers: (u: Record<string, PresenceStatus>) => void,
) {
  const raw = channel.presenceState() as Record<string, PresencePayload[]>
  setOnlineUsers(presenceStateToOnlineUsers(raw))
}

/**
 * Presencia por servidor vía Supabase Realtime Presence (sin polling).
 * Canal: `presence:server:{activeServerId}`.
 */
export function useServerPresence(activeServerId: string | null, userId: string) {
  const accessToken = useAppStore((s) => s.accessToken)
  const setOnlineUsers = useAppStore((s) => s.setOnlineUsers)

  useEffect(() => {
    if (!activeServerId || !userId || !accessToken) {
      setOnlineUsers({})
      return
    }

    const topic = `presence:server:${activeServerId}`
    let channel: RealtimeChannel | null = null
    let cancelled = false

    setOnlineUsers({})
    void (async () => {
      try {
        const supabase = await getAuthenticatedSupabase(accessToken)
        if (cancelled) return

        channel = supabase.channel(topic, {
          config: {
            presence: {
              key: userId,
            },
          },
        })

        const pushState = () => {
          if (!channel) return
          pushPresenceToStore(channel, setOnlineUsers)
        }

        channel
          .on('presence', { event: 'sync' }, pushState)
          .on('presence', { event: 'join' }, pushState)
          .on('presence', { event: 'leave' }, pushState)

        channel.subscribe(async (status) => {
          if (status === 'SUBSCRIBED' && channel) {
            await channel.track({ user_id: userId, status: 'online' as const })
            pushState()
          }
        })
      } catch (e) {
        console.warn('Realtime presence servidor:', e)
      }
    })()

    return () => {
      cancelled = true
      setOnlineUsers({})
      if (!channel) return
      const supabase = getSupabaseBrowserClient()
      void supabase.removeChannel(channel)
    }
  }, [activeServerId, userId, accessToken, setOnlineUsers])
}
