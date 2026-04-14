import { useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { getAuthenticatedSupabase, getSupabaseBrowserClient } from '@/lib/supabase'
import { useAppStore } from '@/store/useAppStore'

export interface TypingUser {
  userId: string
  username: string
}

/**
 * Supabase Presence-based typing indicator for a channel.
 * Returns `typingUsers` (excluding self) and `reportTyping()` to call on input change.
 */
export function useTypingIndicator(channelId: string | null) {
  const userId = useAppStore((s) => s.userId)
  const accessToken = useAppStore((s) => s.accessToken)
  const profile = useAppStore((s) => s.profile)
  const username = profile?.username ?? ''
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([])
  const channelRef = useRef<RealtimeChannel | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const trackedRef = useRef(false)

  useEffect(() => {
    if (!channelId || !accessToken || !userId) {
      setTypingUsers([])
      return
    }

    let cancelled = false
    let localChannel: RealtimeChannel | null = null

    void (async () => {
      try {
        const supabase = await getAuthenticatedSupabase(accessToken)
        if (cancelled) return

        const channel = supabase.channel(`typing:${channelId}`, {
          config: { presence: { key: userId } },
        })
        localChannel = channel
        channelRef.current = channel

        const flush = () => {
          const state = channel.presenceState() as Record<string, { user_id?: string; username?: string }[]>
          const users: TypingUser[] = []
          for (const rows of Object.values(state)) {
            for (const row of rows) {
              if (row.user_id && row.user_id !== userId) {
                users.push({ userId: row.user_id, username: row.username ?? '' })
              }
            }
          }
          setTypingUsers(users)
        }

        channel
          .on('presence', { event: 'sync' }, flush)
          .on('presence', { event: 'join' }, flush)
          .on('presence', { event: 'leave' }, flush)

        channel.subscribe()
      } catch {
        // Silently ignore
      }
    })()

    return () => {
      cancelled = true
      channelRef.current = null
      trackedRef.current = false
      setTypingUsers([])
      if (timerRef.current) clearTimeout(timerRef.current)
      if (localChannel) {
        void localChannel.untrack().catch(() => {})
        const supabase = getSupabaseBrowserClient()
        void supabase.removeChannel(localChannel)
      }
    }
  }, [channelId, accessToken, userId])

  function reportTyping() {
    const ch = channelRef.current
    if (!ch) return

    if (!trackedRef.current) {
      trackedRef.current = true
      void ch.track({ user_id: userId, username }).catch(() => {})
    }

    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      trackedRef.current = false
      void ch.untrack().catch(() => {})
    }, 2500)
  }

  return { typingUsers, reportTyping }
}
