import { useEffect } from 'react'
import { getSupabaseBrowserClient } from '@/lib/supabase'
import { useAppStore } from '@/store/useAppStore'

/**
 * Si un canal se borra en Supabase (Realtime DELETE), lo quitamos del store
 * y limpiamos texto/voz activos para no dejar la UI en un canal fantasma.
 */
export function useChannelDeletedRealtime(serverId: string | null) {
  const pruneDeletedChannel = useAppStore((s) => s.pruneDeletedChannel)

  useEffect(() => {
    if (!serverId) return

    const supabase = getSupabaseBrowserClient()
    const name = `channels-delete-${serverId}`

    const channel = supabase
      .channel(name)
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
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [serverId, pruneDeletedChannel])
}
