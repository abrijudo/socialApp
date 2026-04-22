import type { ChannelMessage } from '@/types/models'

export function UnreadSeparator() {
  return (
    <div
      className="pointer-events-none w-full min-w-0 max-w-full select-none py-2"
      data-testid="unread-messages-separator"
      role="separator"
      aria-label="Mensajes nuevos desde la última visita"
    >
      {/*
        min-w-0 + overflow-hidden: la lista virtual puede heredar un min-content
        ancho (mensajes con líneas largas). Sin contención, el border-t y el
        gradiente se dibujan a todo ese ancho y se solapan con el panel lateral.
      */}
      <div className="border-primary/60 flex min-h-[1.5rem] w-full min-w-0 max-w-full items-center gap-2 overflow-hidden border-t-2">
        <span className="text-primary bg-background shrink-0 px-1.5 text-[0.6rem] font-semibold tracking-[0.12em] uppercase">
          Nuevos mensajes
        </span>
        <div className="from-primary/25 h-px min-w-0 flex-1 bg-gradient-to-r to-transparent" />
      </div>
    </div>
  )
}

/** Filas de la lista virtual: mensaje o separador. */
export type MessageListRow =
  | { kind: 'message'; id: string; message: ChannelMessage }
  | { kind: 'unread-separator' }

export function buildMessageListRows(messages: ChannelMessage[], readBaselineAt: string | null): MessageListRow[] {
  if (messages.length === 0) return []
  if (readBaselineAt == null) {
    return messages.map((m) => ({ kind: 'message' as const, id: m.id, message: m }))
  }
  let insertAt = -1
  for (let i = 0; i < messages.length; i++) {
    if (messages[i].created_at > readBaselineAt) {
      insertAt = i
      break
    }
  }
  if (insertAt < 0) {
    return messages.map((m) => ({ kind: 'message' as const, id: m.id, message: m }))
  }
  const out: MessageListRow[] = []
  for (let i = 0; i < insertAt; i++) {
    out.push({ kind: 'message', id: messages[i].id, message: messages[i] })
  }
  out.push({ kind: 'unread-separator' })
  for (let i = insertAt; i < messages.length; i++) {
    out.push({ kind: 'message', id: messages[i].id, message: messages[i] })
  }
  return out
}

export function findUnreadSeparatorIndex(rows: MessageListRow[]): number {
  return rows.findIndex((r) => r.kind === 'unread-separator')
}
