import { useEffect, useRef, useCallback } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { getAuthenticatedSupabase, getSupabaseBrowserClient } from '@/lib/supabase'
import { useAppStore } from '@/store/useAppStore'

const TYPING_IDLE_MS = 3000

/**
 * Supabase Presence en `typing:${channelId}`: emite “escribiendo” y actualiza
 * `typingUsernamesByChannel` en el store (excluye al usuario actual).
 */
export function useTypingIndicator(channelId: string | null) {
  const userId = useAppStore((s) => s.userId)
  const accessToken = useAppStore((s) => s.accessToken)
  const profile = useAppStore((s) => s.profile)
  const username = profile?.username ?? ''
  const setTypingUsernamesForChannel = useAppStore((s) => s.setTypingUsernamesForChannel)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const trackedRef = useRef(false)

  useEffect(() => {
    if (!channelId || !accessToken || !userId) {
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
          const state = channel.presenceState() as Record<
            string,
            { user_id?: string; username?: string }[]
          >
          const byUser = new Map<string, string>()
          for (const rows of Object.values(state)) {
            for (const row of rows) {
              if (row.user_id && row.user_id !== userId) {
                const name = (row.username ?? '').trim() || 'Alguien'
                if (!byUser.has(row.user_id)) byUser.set(row.user_id, name)
              }
            }
          }
          const names = Array.from(byUser.values()).sort((a, b) =>
            a.localeCompare(b, 'es', { sensitivity: 'base' }),
          )
          setTypingUsernamesForChannel(channelId, names)
        }

        channel
          .on('presence', { event: 'sync' }, flush)
          .on('presence', { event: 'join' }, flush)
          .on('presence', { event: 'leave' }, flush)

        if (cancelled) {
          void supabase.removeChannel(channel)
          return
        }
        channel.subscribe()
      } catch {
        /* noop */
      }
    })()

    return () => {
      cancelled = true
      channelRef.current = null
      trackedRef.current = false
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
      setTypingUsernamesForChannel(channelId, [])
      if (localChannel) {
        void localChannel.untrack().catch(() => {})
        const supabase = getSupabaseBrowserClient()
        void supabase.removeChannel(localChannel)
      }
    }
  }, [channelId, accessToken, userId, setTypingUsernamesForChannel])

  const stopTyping = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    const ch = channelRef.current
    if (!trackedRef.current || !ch) return
    trackedRef.current = false
    void ch.untrack().catch(() => {})
  }, [])

  const reportTyping = useCallback(() => {
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
    }, TYPING_IDLE_MS)
  }, [userId, username])

  return { reportTyping, stopTyping }
}
