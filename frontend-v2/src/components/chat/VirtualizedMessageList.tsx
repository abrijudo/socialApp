import { useCallback, useEffect, useMemo, useRef } from 'react'
import { Loader2 } from 'lucide-react'
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso'
import { MessageItem } from '@/components/chat/MessageItem'
import {
  UnreadSeparator,
  buildMessageListRows,
  findUnreadSeparatorIndex,
  type MessageListRow,
} from '@/components/chat/UnreadSeparator'
import { LUX_ICON_STROKE, luxIconMessage } from '@/lib/luxIcon'
import { cn } from '@/lib/utils'
import type { ChannelMessage } from '@/types/models'

export type VirtualizedMessageListProps = {
  /** Al cambiar de canal/DM se resetea el scroll. */
  listKey: string
  messages: ChannelMessage[]
  messagesById: Map<string, ChannelMessage>
  onReply: (msg: ChannelMessage) => void
  onAuthorClick?: (authorId: string) => void
  isDm?: boolean
  /** `lastReadTimestamps[id]` en el instante *antes* de `markChannelAsRead` al entrar al hilo. */
  readBaselineAt: string | null
  /** Estado “estoy al final” (p. ej. para no forzar scroll si el usuario leyó arriba). */
  onUserScrollNudge?: (atBottom: boolean) => void
  /** Paginación inversa: hay más historial y el usuario llegó arriba. */
  hasMoreOlder?: boolean
  loadingOlder?: boolean
  onLoadOlder?: () => void | Promise<void>
  /** Altura fija: el contenedor flex debe ser `min-h-0 flex-1`. */
  className?: string
}

/**
 * Listado de mensajes virtualizado: solo se montan filas cerca del viewport;
 * adecuado para miles de mensajes en memoria caché.
 */
export function VirtualizedMessageList({
  listKey,
  messages,
  messagesById,
  onReply,
  onAuthorClick,
  isDm,
  readBaselineAt,
  onUserScrollNudge,
  hasMoreOlder = false,
  loadingOlder = false,
  onLoadOlder,
  className = 'min-h-0 flex-1',
}: VirtualizedMessageListProps) {
  const loadOlderInFlight = useRef(false)
  const virtuosoRef = useRef<VirtuosoHandle>(null)
  /**
   * Un solo “scroll inicial” al entrar en un hilo (misma clave = mismo canal/DM):
   * con no leídos → al separador; sin no leídos (o sin baseline) → al último mensaje.
   * No se repite al cargar historial hacia arriba ni al enviar mensajes.
   */
  const initialScrollDoneForListKey = useRef<string | null>(null)

  const rows: MessageListRow[] = useMemo(
    () => buildMessageListRows(messages, readBaselineAt),
    [messages, readBaselineAt],
  )

  useEffect(() => {
    initialScrollDoneForListKey.current = null
  }, [listKey])

  useEffect(() => {
    if (rows.length === 0) return
    if (initialScrollDoneForListKey.current === listKey) return

    const snapshot = rows
    const t = window.setTimeout(() => {
      if (initialScrollDoneForListKey.current === listKey) return
      initialScrollDoneForListKey.current = listKey
      const sep = findUnreadSeparatorIndex(snapshot)
      if (sep >= 0) {
        virtuosoRef.current?.scrollToIndex({ index: sep, align: 'center', behavior: 'auto' })
        return
      }
      const last = snapshot.length - 1
      virtuosoRef.current?.scrollToIndex({ index: last, align: 'end', behavior: 'auto' })
    }, 32)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `rows` del cierre: incluirlo re-ejecutaría en cada mensaje.
  }, [listKey, rows.length, readBaselineAt])

  const onAtBottom = useCallback(
    (atBottom: boolean) => {
      onUserScrollNudge?.(atBottom)
    },
    [onUserScrollNudge],
  )

  const onAtTop = useCallback(
    (atTop: boolean) => {
      if (!atTop || !hasMoreOlder || loadingOlder || !onLoadOlder) return
      if (loadOlderInFlight.current) return
      loadOlderInFlight.current = true
      void Promise.resolve(onLoadOlder()).finally(() => {
        loadOlderInFlight.current = false
      })
    },
    [hasMoreOlder, loadingOlder, onLoadOlder],
  )

  if (messages.length === 0) {
    return null
  }

  return (
    <Virtuoso
      ref={virtuosoRef}
      key={listKey}
      className={cn(
        // Evita que filas con min-content ancho (p. ej. URLs) ensanchen el
        // scroller y pinten bajo la columna de miembros.
        'min-w-0 overflow-x-hidden',
        className,
      )}
      data={rows}
      followOutput="smooth"
      atBottomStateChange={onAtBottom}
      atTopStateChange={onAtTop}
      atBottomThreshold={100}
      atTopThreshold={120}
      defaultItemHeight={72}
      increaseViewportBy={{ top: 240, bottom: 400 }}
      computeItemKey={(_index, row) => (row.kind === 'message' ? row.id : 'unread-sep')}
      components={{
        Header: () =>
          loadingOlder ? (
            <div className="text-muted-foreground flex justify-center py-3" aria-busy="true" aria-label="Cargando historial">
              <Loader2 className={cn(luxIconMessage, 'size-5 animate-spin')} strokeWidth={LUX_ICON_STROKE} />
            </div>
          ) : hasMoreOlder ? (
            <div className="text-muted-foreground/80 py-2 text-center text-[0.65rem] font-medium tracking-wide">
              Desliza para cargar mensajes anteriores
            </div>
          ) : null,
      }}
      itemContent={(_index, row) => {
        if (row.kind === 'unread-separator') {
          return (
            <div className="max-w-full min-w-0 overflow-x-hidden pr-0.5 pb-px">
              <UnreadSeparator />
            </div>
          )
        }
        const msg = row.message
        return (
          <div className="max-w-full min-w-0 pr-0.5 pb-px">
            <MessageItem
              msg={msg}
              isDm={isDm}
              onAuthorClick={onAuthorClick}
              onReply={onReply}
              replyTarget={
                msg.parent_message
                  ? msg.parent_message
                  : msg.parent_message_id
                    ? (messagesById.get(msg.parent_message_id) ?? null)
                    : null
              }
            />
          </div>
        )
      }}
    />
  )
}
