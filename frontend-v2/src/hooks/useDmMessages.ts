import { useEffect } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { getAuthenticatedSupabase, getSupabaseBrowserClient } from '@/lib/supabase'
import { apiGetJson } from '@/lib/api'
import { toast } from 'sonner'
import { useAppStore } from '@/store/useAppStore'
import type { ChannelMessage, Profile } from '@/types/models'

/**
 * TTL para evitar refetches redundantes cuando el componente se desmonta y
 * se remonta en pocos segundos (p. ej. al entrar/salir de voz o por
 * StrictMode en desarrollo). Mismo patrón que `useChannelMessages`.
 */
const lastFetchedAt = new Map<string, number>()
const FETCH_TTL_MS = 30_000

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
 * Historial vía `GET /api/dm/:dmChannelId/messages` y actualizaciones vía
 * Supabase Realtime sobre `dm_messages`.
 *
 * Los mensajes se cachean en `dmMessagesByChannel` del store, así que al
 * desmontar/remontar el componente (por ejemplo al entrar/salir de voz, o al
 * cambiar de DM y volver) NO se vuelve a mostrar el spinner ni se reinicia
 * la lista: se revalidan en background.
 *
 * Pensado para invocarse UNA vez desde `AppLayout` con el DM activo; así la
 * suscripción realtime sigue viva aunque el componente `DmChatArea` entre y
 * salga del árbol (p. ej. al activar un canal de voz).
 */
export function useDmMessages(dmChannelId: string | null) {
  const accessToken = useAppStore((s) => s.accessToken)
  const userId = useAppStore((s) => s.userId)

  useEffect(() => {
    if (!dmChannelId || !accessToken) return

    let cancelled = false
    let realtimeChannel: RealtimeChannel | null = null
    const realtimeName = `dm-messages-${dmChannelId}-${Date.now()}`

    const store = useAppStore.getState()
    const alreadyLoaded = dmChannelId in store.dmMessagesByChannel
    const lastAt = lastFetchedAt.get(dmChannelId) ?? 0
    const isFresh = alreadyLoaded && Date.now() - lastAt < FETCH_TTL_MS

    if (!alreadyLoaded) {
      useAppStore.getState().setDmChannelMessagesLoading(dmChannelId, true)
    }

    void (async () => {
      try {
        if (!isFresh) {
          const data = await apiGetJson<Record<string, unknown>[]>(
            `/api/dm/${dmChannelId}/messages`,
            accessToken,
          )
          if (!cancelled) {
            const list = Array.isArray(data) ? data : []
            useAppStore
              .getState()
              .setDmChannelMessages(
                dmChannelId,
                list.map((row) => normalizeApiRow(row, dmChannelId)),
              )
            lastFetchedAt.set(dmChannelId, Date.now())
          }
        }
      } catch {
        if (!cancelled && !alreadyLoaded) {
          useAppStore.getState().setDmChannelMessages(dmChannelId, [])
        }
      } finally {
        if (!cancelled) {
          useAppStore.getState().setDmChannelMessagesLoading(dmChannelId, false)
        }
      }

      if (cancelled) return

      try {
        const supabase = await getAuthenticatedSupabase(accessToken)
        if (cancelled) return

        const filter = `dm_channel_id=eq.${dmChannelId}`

        const channel = supabase
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

              const authorId = String(row.author_id)
              const profile = profileForDmAuthor(dmChannelId, authorId)
              const msg = rowToMessage(row, profile, dmChannelId)
              const state = useAppStore.getState()
              state.appendDmChannelMessage(dmChannelId, msg)
              if (userId && authorId !== userId) {
                const preview =
                  msg.body.length > 160 ? `${msg.body.slice(0, 157)}…` : msg.body
                toast('Nuevo mensaje privado', { description: preview })
                if (dmChannelId !== state.activeDmChannelId) {
                  state.incrementUnread(dmChannelId)
                }
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

              const authorId = String(row.author_id)
              const profile = profileForDmAuthor(dmChannelId, authorId)
              const msg = rowToMessage(row, profile, dmChannelId)
              // Evitar que el patch sobrescriba reactions/replyCount con vacíos
              // (realtime solo reporta columnas propias de `dm_messages`).
              const { reactions: _r, replyCount: _c, ...patch } = msg
              useAppStore.getState().updateDmMessage(String(row.id), patch)
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
              useAppStore.getState().removeDmMessage(oldRow.id)
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
            console.warn('Realtime DM:', status, err ?? '')
            void (async () => {
              try {
                const data = await apiGetJson<Record<string, unknown>[]>(
                  `/api/dm/${dmChannelId}/messages`,
                  accessToken,
                )
                if (!cancelled) {
                  const list = Array.isArray(data) ? data : []
                  useAppStore
                    .getState()
                    .setDmChannelMessages(
                      dmChannelId,
                      list.map((row) => normalizeApiRow(row, dmChannelId)),
                    )
                  lastFetchedAt.set(dmChannelId, Date.now())
                }
              } catch { /* silently retry on next event */ }
            })()
          }
        })
      } catch (e) {
        console.warn('Suscripción Realtime DM:', e)
      }
    })()

    return () => {
      cancelled = true
      // Importante: NO limpiamos `dmMessagesByChannel[dmChannelId]` al
      // desmontar. Los mensajes se conservan para que, al volver al DM (por
      // ejemplo tras entrar/salir de voz), aparezcan al instante y sin
      // spinner.
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
  }, [dmChannelId, accessToken, userId])
}

/**
 * Inserta optimistamente en el cache el mensaje devuelto por
 * `POST /api/dm/:dmChannelId/messages`, para verlo inmediatamente sin esperar
 * al evento Realtime.
 */
export function appendDmMessageFromPostResponse(
  dmChannelId: string,
  row: Record<string, unknown>,
) {
  if (!dmChannelId || !row?.id) return
  const authorId = String(row.author_id)
  const profile = profileForDmAuthor(dmChannelId, authorId)
  const msg = rowToMessage(row, profile, dmChannelId)
  useAppStore.getState().appendDmChannelMessage(dmChannelId, msg)
}
