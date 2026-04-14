import { useEffect, useState, useCallback } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { getAuthenticatedSupabase, getSupabaseBrowserClient } from '@/lib/supabase'
import { apiGetJson } from '@/lib/api'
import { toast } from 'sonner'
import { useAppStore } from '@/store/useAppStore'
import type { ChannelMessage, Profile } from '@/types/models'

function profileForDmAuthor(dmChannelId: string, authorId: string): Profile | null {
  const s = useAppStore.getState()
  if (authorId === s.userId && s.profile) {
    return s.profile
  }
  const dm = s.dmChannels.find((d) => d.id === dmChannelId)
  const o = dm?.otherUser
  if (o && o.user_id === authorId) {
    return {
      user_id: o.user_id,
      username: o.username,
      display_name: o.display_name,
      avatar_url: o.avatar_url,
      bio: o.bio ?? '',
      status: o.status ?? 'offline',
    }
  }
  return null
}

function rowToMessage(
  row: Record<string, unknown>,
  profile: Profile | null,
  dmChannelId: string,
): ChannelMessage {
  return {
    id: String(row.id),
    channel_id: String(row.dm_channel_id ?? dmChannelId),
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
    profiles: profile ?? (row.profiles as Profile | null | undefined) ?? null,
    reactions: [],
    replyCount: 0,
  }
}

function normalizeApiRow(
  row: Record<string, unknown>,
  dmChannelId: string,
): ChannelMessage {
  const authorId = String(row.author_id)
  const mergedProfile =
    (row.profiles as Profile | null | undefined) ??
    profileForDmAuthor(dmChannelId, authorId)
  return rowToMessage(row, mergedProfile ?? null, dmChannelId)
}

/**
 * Historial vía GET /api/dm/:dmChannelId/messages y Supabase Realtime sobre `dm_messages`.
 */
export function useDmMessages(dmChannelId: string | null) {
  const [isLoading, setIsLoading] = useState(false)
  const accessToken = useAppStore((s) => s.accessToken)
  const userId = useAppStore((s) => s.userId)
  const setDmMessages = useAppStore((s) => s.setDmMessages)

  const appendMessage = useCallback((msg: ChannelMessage) => {
    useAppStore.setState((state) => {
      if (state.dmMessages.some((m) => m.id === msg.id)) return state
      return { dmMessages: [...state.dmMessages, msg] }
    })
  }, [])

  useEffect(() => {
    if (!dmChannelId || !accessToken) {
      setDmMessages([])
      setIsLoading(false)
      return
    }

    let cancelled = false
    const realtimeName = `dm-messages-${dmChannelId}`

    setDmMessages([])
    setIsLoading(true)

    void (async () => {
      try {
        const data = await apiGetJson<Record<string, unknown>[]>(
          `/api/dm/${dmChannelId}/messages`,
          accessToken,
        )
        if (!cancelled) {
          const list = Array.isArray(data) ? data : []
          setDmMessages(list.map((row) => normalizeApiRow(row, dmChannelId)))
        }
      } catch {
        if (!cancelled) setDmMessages([])
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    })()

    const filter = `dm_channel_id=eq.${dmChannelId}`
    let channel: RealtimeChannel | null = null

    void (async () => {
      try {
        const supabase = await getAuthenticatedSupabase(accessToken)
        if (cancelled) return

        channel = supabase
          .channel(realtimeName)
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'dm_messages',
              filter,
            },
            (payload) => {
              const row = payload.new as Record<string, unknown>
              if (!row?.id) return
              if (row.parent_message_id != null) return

              const authorId = String(row.author_id)
              const profile = profileForDmAuthor(dmChannelId, authorId)
              const msg = rowToMessage(row, profile, dmChannelId)
              appendMessage(msg)
              if (userId && authorId !== userId) {
                const preview =
                  msg.body.length > 160 ? `${msg.body.slice(0, 157)}…` : msg.body
                toast('Nuevo mensaje privado', { description: preview })
              }
            },
          )
          .on(
            'postgres_changes',
            {
              event: 'UPDATE',
              schema: 'public',
              table: 'dm_messages',
              filter,
            },
            (payload) => {
              const row = payload.new as Record<string, unknown>
              if (!row?.id) return
              if (row.parent_message_id != null) return

              const authorId = String(row.author_id)
              const profile = profileForDmAuthor(dmChannelId, authorId)
              const msg = rowToMessage(row, profile, dmChannelId)
              useAppStore.setState((state) => ({
                dmMessages: state.dmMessages.map((m) => (m.id === msg.id ? { ...m, ...msg } : m)),
              }))
            },
          )
          .on(
            'postgres_changes',
            {
              event: 'DELETE',
              schema: 'public',
              table: 'dm_messages',
              filter,
            },
            (payload) => {
              const oldRow = payload.old as { id?: string }
              if (!oldRow?.id) return
              useAppStore.setState((state) => ({
                dmMessages: state.dmMessages.filter((m) => m.id !== oldRow.id),
              }))
            },
          )

        channel.subscribe()
      } catch (e) {
        console.warn('Suscripción Realtime DM:', e)
      }
    })()

    return () => {
      cancelled = true
      const ch = channel
      if (!ch) return
      const supabase = getSupabaseBrowserClient()
      void supabase.removeChannel(ch)
    }
  }, [dmChannelId, accessToken, appendMessage, userId, setDmMessages])

  const appendFromPostResponse = useCallback(
    (row: Record<string, unknown>) => {
      if (!dmChannelId || !row?.id) return
      const authorId = String(row.author_id)
      const profile = profileForDmAuthor(dmChannelId, authorId)
      const msg = rowToMessage(row, profile, dmChannelId)
      appendMessage(msg)
    },
    [dmChannelId, appendMessage],
  )

  return { isLoading, appendFromPostResponse }
}
