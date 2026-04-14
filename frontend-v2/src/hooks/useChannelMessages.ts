import { useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { getAuthenticatedSupabase, getSupabaseBrowserClient } from '@/lib/supabase'
import { apiGetJson } from '@/lib/api'
import { useAppStore } from '@/store/useAppStore'
import type {
  ChannelMessage,
  ChannelMessagesResponse,
  Profile,
  ServerMember,
} from '@/types/models'

function profileForAuthor(members: ServerMember[], authorId: string): Profile | null {
  const m = members.find((x) => x.user_id === authorId)
  return m?.profile ?? null
}

function rowToMessage(row: Record<string, unknown>, profile: Profile | null): ChannelMessage {
  return {
    id: String(row.id),
    channel_id: String(row.channel_id),
    author_id: String(row.author_id),
    body: String(row.body ?? ''),
    created_at: String(row.created_at),
    edited_at: row.edited_at != null ? String(row.edited_at) : null,
    message_type: String(row.message_type ?? 'text'),
    media_data: row.media_data != null ? String(row.media_data) : null,
    media_mime: row.media_mime != null ? String(row.media_mime) : null,
    media_name: row.media_name != null ? String(row.media_name) : null,
    media_duration_ms:
      typeof row.media_duration_ms === 'number' ? row.media_duration_ms : null,
    parent_message_id: row.parent_message_id != null ? String(row.parent_message_id) : null,
    profiles: profile,
    reactions: [],
    replyCount: 0,
  }
}

/**
 * Historial vía GET /api/messages/:channelId y actualizaciones vía Supabase Realtime (sin polling).
 */
export function useChannelMessages(channelId: string | null) {
  const [isLoading, setIsLoading] = useState(false)
  const setMessages = useAppStore((s) => s.setMessages)
  const accessToken = useAppStore((s) => s.accessToken)
  const members = useAppStore((s) => s.members)
  const membersRef = useRef(members)
  membersRef.current = members

  useEffect(() => {
    if (!channelId || !accessToken) {
      setMessages([])
      setIsLoading(false)
      return
    }

    let cancelled = false
    let realtimeChannel: RealtimeChannel | null = null
    const realtimeName = `messages:${channelId}:${Date.now()}`

    setMessages([])
    setIsLoading(true)

    void (async () => {
      try {
        await getAuthenticatedSupabase(accessToken)

        const data = await apiGetJson<ChannelMessagesResponse>(
          `/api/messages/${channelId}?limit=50`,
          accessToken,
        )
        if (!cancelled) setMessages(data.messages ?? [])
      } catch {
        if (!cancelled) setMessages([])
      } finally {
        if (!cancelled) setIsLoading(false)
      }

      if (cancelled) return

      try {
        const supabase = await getAuthenticatedSupabase(accessToken)
        if (cancelled) return

        const filter = `channel_id=eq.${channelId}`

        const channel = supabase
          .channel(realtimeName)
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'messages',
              filter,
            },
            (payload) => {
              const row = payload.new as Record<string, unknown>
              if (!row?.id) return
              if (row.parent_message_id != null) return

              const profile = profileForAuthor(membersRef.current, String(row.author_id))
              const msg = rowToMessage(row, profile)
              useAppStore.setState((state) => {
                if (state.messages.some((m) => m.id === msg.id)) return state
                return { messages: [...state.messages, msg] }
              })
            },
          )
          .on(
            'postgres_changes',
            {
              event: 'UPDATE',
              schema: 'public',
              table: 'messages',
              filter,
            },
            (payload) => {
              const row = payload.new as Record<string, unknown>
              if (!row?.id) return
              if (row.parent_message_id != null) return

              const profile = profileForAuthor(membersRef.current, String(row.author_id))
              const msg = rowToMessage(row, profile)
              useAppStore.setState((state) => ({
                messages: state.messages.map((m) => (m.id === msg.id ? { ...m, ...msg } : m)),
              }))
            },
          )
          .on(
            'postgres_changes',
            {
              event: 'DELETE',
              schema: 'public',
              table: 'messages',
              filter,
            },
            (payload) => {
              const oldRow = payload.old as { id?: string }
              if (!oldRow?.id) return
              useAppStore.setState((state) => ({
                messages: state.messages.filter((m) => m.id !== oldRow.id),
              }))
            },
          )

        if (cancelled) {
          void supabase.removeChannel(channel)
          return
        }

        realtimeChannel = channel
        channel.subscribe((status, err) => {
          if (status === 'SUBSCRIBED') return
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.warn('Realtime messages:', status, err ?? '')
            void (async () => {
              try {
                const fresh = await apiGetJson<ChannelMessagesResponse>(
                  `/api/messages/${channelId}?limit=50`,
                  accessToken,
                )
                if (!cancelled) setMessages(fresh.messages ?? [])
              } catch { /* silently retry on next event */ }
            })()
          }
        })
      } catch (e) {
        console.warn('Suscripción Realtime mensajes:', e)
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
        /* cliente aún no listo */
      }
    }
  }, [channelId, accessToken, setMessages])

  return { isLoading }
}
