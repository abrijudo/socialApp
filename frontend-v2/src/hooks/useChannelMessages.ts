import { useEffect, useRef } from 'react'
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

/**
 * Historial vía `GET /api/messages/:channelId` y actualizaciones vía Supabase
 * Realtime. Los mensajes se cachean en `messagesByChannel` del store, así que
 * al desmontar/remontar el componente (por ejemplo al entrar/salir de voz, o
 * al cambiar de canal y volver) NO se vuelve a mostrar el spinner ni se
 * reinicia la lista: se revalidan en background.
 *
 * Pensado para invocarse UNA vez desde `AppLayout` con el canal activo; así
 * la suscripción realtime sigue viva aunque el componente `ChatArea` entre
 * y salga del árbol (p. ej. al activar un canal de voz).
 */
export function useChannelMessages(channelId: string | null) {
  const accessToken = useAppStore((s) => s.accessToken)
  const members = useAppStore((s) => s.members)
  const membersRef = useRef(members)
  membersRef.current = members

  useEffect(() => {
    if (!channelId || !accessToken) return

    let cancelled = false
    let realtimeChannel: RealtimeChannel | null = null
    const realtimeName = `messages:${channelId}:${Date.now()}`

    const store = useAppStore.getState()
    const alreadyLoaded = channelId in store.messagesByChannel
    const lastAt = lastFetchedAt.get(channelId) ?? 0
    const isFresh = alreadyLoaded && Date.now() - lastAt < FETCH_TTL_MS
    // Solo mostramos loading cuando el canal NO ha sido cargado nunca en esta
    // sesión. En los cambios de canal posteriores se muestra la cache al
    // instante mientras revalidamos silenciosamente.
    if (!alreadyLoaded) {
      useAppStore.getState().setChannelMessagesLoading(channelId, true)
    }

    void (async () => {
      try {
        await getAuthenticatedSupabase(accessToken)

        // Si los datos siguen frescos, NO repetimos el fetch de historial: la
        // suscripción realtime se encarga del resto. Esto evita que al entrar
        // y salir de voz (o por StrictMode) se lance una petición por cada
        // montaje del componente.
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
        // Si ya había cache, mantenemos lo que tuviéramos; si no, marcamos lista vacía.
        if (!cancelled && !alreadyLoaded) {
          useAppStore.getState().setChannelMessages(channelId, [])
        }
      } finally {
        if (!cancelled) {
          useAppStore.getState().setChannelMessagesLoading(channelId, false)
        }
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

              const profile = profileForAuthor(membersRef.current, String(row.author_id))
              const msg = rowToMessage(row, profile)
              const state = useAppStore.getState()
              state.appendChannelMessage(channelId, msg)
              if (channelId !== state.activeTextChannelId) {
                state.incrementUnread(channelId)
              }
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

              const profile = profileForAuthor(membersRef.current, String(row.author_id))
              const msg = rowToMessage(row, profile)
              // El realtime de `messages` NO incluye reacciones ni el contador de
              // respuestas (viven en otras tablas). Si aplicáramos el mensaje
              // entero como patch, machacaríamos los valores reales con vacíos.
              // Limpiamos el patch a los campos realmente editables.
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
              filter,
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
                const fresh = await apiGetJson<ChannelMessagesResponse>(
                  `/api/messages/${channelId}?limit=50`,
                  accessToken,
                )
                if (!cancelled) {
                  useAppStore.getState().setChannelMessages(channelId, fresh.messages ?? [])
                }
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
      // Importante: NO limpiamos `messagesByChannel[channelId]` al desmontar.
      // Los mensajes se conservan para que, al volver al canal (p. ej. tras
      // entrar/salir de voz), aparezcan al instante y sin spinner.
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
  }, [channelId, accessToken])
}
