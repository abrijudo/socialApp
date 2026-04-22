import { useEffect } from 'react'
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

/**
 * Inserta optimistamente en la cache el mensaje devuelto por
 * `POST /api/messages`, así el autor lo ve de inmediato sin esperar al evento
 * realtime. El INSERT realtime posterior se deduplica por id en
 * `appendChannelMessage` y no genera duplicados.
 */
export function appendChannelMessageFromPostResponse(
  channelId: string,
  row: Record<string, unknown>,
) {
  if (!channelId || !row?.id) return
  const authorId = String(row.author_id)
  const state = useAppStore.getState()
  const profile =
    authorId === state.userId
      ? state.profile
      : profileForAuthor(state.members, authorId)
  const msg = rowToMessage(row, profile ?? null)
  state.appendChannelMessage(channelId, msg)
}

/**
 * Marca de tiempo del último fetch de historial por canal. Se usa como TTL
 * para evitar refetches redundantes cuando el componente se desmonta y se
 * remonta en pocos segundos (p. ej. al entrar/salir de un canal de voz, o
 * por StrictMode en desarrollo). Vive a nivel de módulo para no inflar el
 * store global.
 */
const lastFetchedAt = new Map<string, number>()
const FETCH_TTL_MS = 30_000

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

const membersRefGlobal = { current: [] as ServerMember[] }

/**
 * Suscripción única a `public.messages` (sin filtro por canal): RLS decide
 * qué filas recibe el usuario. Así los canales que no están abiertos también
 * se actualizan en caché y al cambiar de chat no hace falta recargar.
 *
 * Invocar una vez desde `AppLayout` junto con `useChannelMessages` (solo fetch).
 */
export function useGlobalMessagesRealtime() {
  const accessToken = useAppStore((s) => s.accessToken)
  const members = useAppStore((s) => s.members)
  membersRefGlobal.current = members

  useEffect(() => {
    if (!accessToken) return

    let cancelled = false
    let realtimeChannel: RealtimeChannel | null = null
    const realtimeName = `messages-global:${Date.now()}`

    void (async () => {
      try {
        const supabase = await getAuthenticatedSupabase(accessToken)
        if (cancelled) return

        const channel = supabase
          .channel(realtimeName)
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'messages',
            },
            (payload) => {
              const row = payload.new as Record<string, unknown>
              if (!row?.id || row.channel_id == null) return
              const chId = String(row.channel_id)

              const profile = profileForAuthor(membersRefGlobal.current, String(row.author_id))
              const msg = rowToMessage(row, profile)
              const state = useAppStore.getState()
              state.appendChannelMessage(chId, msg)
              if (chId !== state.activeTextChannelId) {
                state.incrementUnread(chId)
              }
            },
          )
          .on(
            'postgres_changes',
            {
              event: 'UPDATE',
              schema: 'public',
              table: 'messages',
            },
            (payload) => {
              const row = payload.new as Record<string, unknown>
              if (!row?.id) return

              const profile = profileForAuthor(membersRefGlobal.current, String(row.author_id))
              const msg = rowToMessage(row, profile)
              const { reactions: _r, replyCount: _c, ...patch } = msg
              useAppStore.getState().updateMessage(String(row.id), patch)
            },
          )
          .on(
            'postgres_changes',
            {
              event: 'DELETE',
              schema: 'public',
              table: 'messages',
            },
            (payload) => {
              const oldRow = payload.old as { id?: string }
              if (!oldRow?.id) return
              useAppStore.getState().removeMessage(oldRow.id)
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
                const { activeTextChannelId: activeCh } = useAppStore.getState()
                if (!activeCh) return
                const fresh = await apiGetJson<ChannelMessagesResponse>(
                  `/api/messages/${activeCh}?limit=50`,
                  accessToken,
                )
                if (!cancelled) {
                  useAppStore.getState().setChannelMessages(activeCh, fresh.messages ?? [])
                }
              } catch {
                /* reintento en el siguiente evento */
              }
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
  }, [accessToken])
}

/**
 * Historial vía `GET /api/messages/:channelId`. Las actualizaciones en vivo
 * las aplica `useGlobalMessagesRealtime`.
 */
export function useChannelMessages(channelId: string | null) {
  const accessToken = useAppStore((s) => s.accessToken)

  useEffect(() => {
    if (!channelId || !accessToken) return

    let cancelled = false

    const store = useAppStore.getState()
    const alreadyLoaded = channelId in store.messagesByChannel
    const lastAt = lastFetchedAt.get(channelId) ?? 0
    const isFresh = alreadyLoaded && Date.now() - lastAt < FETCH_TTL_MS
    if (!alreadyLoaded) {
      useAppStore.getState().setChannelMessagesLoading(channelId, true)
    }

    void (async () => {
      try {
        await getAuthenticatedSupabase(accessToken)

        if (!isFresh) {
          const data = await apiGetJson<ChannelMessagesResponse>(
            `/api/messages/${channelId}?limit=50`,
            accessToken,
          )
          if (!cancelled) {
            useAppStore.getState().setChannelMessages(channelId, data.messages ?? [])
            lastFetchedAt.set(channelId, Date.now())
          }
        }
      } catch {
        if (!cancelled && !alreadyLoaded) {
          useAppStore.getState().setChannelMessages(channelId, [])
        }
      } finally {
        if (!cancelled) {
          useAppStore.getState().setChannelMessagesLoading(channelId, false)
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [channelId, accessToken])
}
