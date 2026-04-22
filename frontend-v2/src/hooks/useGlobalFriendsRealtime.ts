import { useEffect } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { getAuthenticatedSupabase, getSupabaseBrowserClient } from '@/lib/supabase'
import { useAppStore } from '@/store/useAppStore'

/**
 * Suscripción a `public.friendships` para recargar la lista (GET /api/friends) ante cualquier
 * cambio. Invocar una sola vez desde el layout (con el usuario conectado).
 */
export function useGlobalFriendsRealtime() {
  const accessToken = useAppStore((s) => s.accessToken)
  const initialBootDone = useAppStore((s) => s.initialBootDone)

  useEffect(() => {
    if (!accessToken || !initialBootDone) return
    void useAppStore.getState().refreshFriends()

    let cancelled = false
    let realtimeChannel: RealtimeChannel | null = null
    const name = `friendships-global:${Date.now()}`

    const refresh = () => {
      void useAppStore.getState().refreshFriends()
    }

    void (async () => {
      try {
        const supabase = await getAuthenticatedSupabase(accessToken)
        if (cancelled) return
        const channel = supabase
          .channel(name)
          .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'friendships' },
            () => { refresh() },
          )
          .on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'friendships' },
            () => { refresh() },
          )
          .on(
            'postgres_changes',
            { event: 'DELETE', schema: 'public', table: 'friendships' },
            () => { refresh() },
          )

        if (cancelled) {
          void supabase.removeChannel(channel)
          return
        }
        realtimeChannel = channel
        channel.subscribe()
      } catch (e) {
        console.warn('Realtime friendships:', e)
      }
    })()

    return () => {
      cancelled = true
      const ch = realtimeChannel
      realtimeChannel = null
      if (!ch) return
      try {
        const supabase = getSupabaseBrowserClient()
        void supabase.removeChannel(ch)
      } catch {
        /* noop */
      }
    }
  }, [accessToken, initialBootDone])
}
