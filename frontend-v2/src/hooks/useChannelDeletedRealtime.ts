import { useEffect } from 'react'
import { getAuthenticatedSupabase, getSupabaseBrowserClient } from '@/lib/supabase'
import { useAppStore } from '@/store/useAppStore'

export function useChannelDeletedRealtime(serverId: string | null) {
  const pruneDeletedChannel = useAppStore((s) => s.pruneDeletedChannel)
  const accessToken = useAppStore((s) => s.accessToken)

  useEffect(() => {
    if (!serverId || !accessToken) return

    let cancelled = false
    let localChannel: ReturnType<ReturnType<typeof getSupabaseBrowserClient>['channel']> | null = null

    void (async () => {
      try {
        const supabase = await getAuthenticatedSupabase(accessToken)
        if (cancelled) return

        const channel = supabase
          .channel(`channels-delete-${serverId}`)
          .on(
            'postgres_changes',
            {
              event: 'DELETE',
              schema: 'public',
              table: 'channels',
              filter: `server_id=eq.${serverId}`,
            },
            (payload) => {
              const id = (payload.old as { id?: string })?.id
              if (id) pruneDeletedChannel(id)
            },
          )

        localChannel = channel
        channel.subscribe((status, err) => {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.warn('Realtime channel-delete:', status, err ?? '')
          }
        })
      } catch (e) {
        console.warn('useChannelDeletedRealtime:', e)
      }
    })()

    return () => {
      cancelled = true
      if (localChannel) {
        const supabase = getSupabaseBrowserClient()
        void supabase.removeChannel(localChannel)
      }
    }
  }, [serverId, accessToken, pruneDeletedChannel])
}
