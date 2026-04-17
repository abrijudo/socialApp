import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Hash, Loader2, Send, X } from 'lucide-react'
import { appendChannelMessageFromPostResponse } from '@/hooks/useChannelMessages'
import { useTypingIndicator } from '@/hooks/useTypingIndicator'
import { apiPostJson } from '@/lib/api'
import { MessageItem } from '@/components/chat/MessageItem'
import { MessageSkeleton } from '@/components/chat/MessageSkeleton'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAppStore } from '@/store/useAppStore'
import type { ChannelMessage } from '@/types/models'

// Array compartido para evitar nueva referencia cuando no hay mensajes cacheados;
// así el selector devuelve la misma instancia y no dispara re-renders.
const EMPTY_MESSAGES: ChannelMessage[] = []
const EMPTY_DRAFT = { body: '', replyToId: null as string | null }

export interface ChatAreaProps {
  channelId: string | null
  onAuthorClick?: (authorId: string) => void
}

function ChannelEmptyWelcome({ channelName }: { channelName: string }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto p-3 text-center">
      <div
        className="bg-muted mb-4 flex size-20 shrink-0 items-center justify-center rounded-[20px]"
        aria-hidden
      >
        <Hash className="text-muted-foreground size-10" />
      </div>
      <h3 className="text-foreground max-w-lg text-2xl font-semibold tracking-tight">
        Te damos la bienvenida a #{channelName}
      </h3>
      <p className="text-muted-foreground mt-2 max-w-md text-sm leading-relaxed">
        Este es el comienzo del canal.
      </p>
    </div>
  )
}

export function ChatArea({ channelId, onAuthorClick }: ChatAreaProps) {
  const messages = useAppStore((s) =>
    channelId ? s.messagesByChannel[channelId] ?? EMPTY_MESSAGES : EMPTY_MESSAGES,
  )
  // `isLoading` ahora lo publica `useChannelMessages` (montado en `AppLayout`)
  // dentro del store, así el spinner puede mostrarse sin que este componente
  // "posea" la suscripción realtime y se arrastre un desmontaje cada vez que
  // el layout cambia (por ejemplo al entrar/salir de un canal de voz).
  const isLoading = useAppStore((s) =>
    channelId ? s.messagesLoadingByChannel[channelId] ?? false : false,
  )
  const channels = useAppStore((s) => s.channels)
  const accessToken = useAppStore((s) => s.accessToken)
  // Draft persistente por canal: se guarda en el store para que al cambiar de
  // canal y volver siga ahí (y que el `parentMessageId` de la respuesta sea
  // siempre del canal correcto).
  const draftEntry = useAppStore((s) =>
    channelId ? s.drafts[channelId] ?? EMPTY_DRAFT : EMPTY_DRAFT,
  )
  const setDraftBody = useAppStore((s) => s.setDraftBody)
  const setDraftReply = useAppStore((s) => s.setDraftReply)
  const clearDraft = useAppStore((s) => s.clearDraft)
  const { typingUsers, reportTyping } = useTypingIndicator(channelId)
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const isNearBottomRef = useRef(true)
  const inputRef = useRef<HTMLInputElement>(null)

  const messagesById = useMemo(() => {
    const map = new Map<string, ChannelMessage>()
    for (const m of messages) map.set(m.id, m)
    return map
  }, [messages])

  const draft = draftEntry.body
  const replyTo: ChannelMessage | null = draftEntry.replyToId
    ? messagesById.get(draftEntry.replyToId) ?? null
    : null

  const activeChannel = channelId ? channels.find((c) => c.id === channelId) : undefined
  const channelName = activeChannel?.name?.trim() || 'canal'

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current
    if (!el) return
    isNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }, [])

  useLayoutEffect(() => {
    if (isNearBottomRef.current) {
      endRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

  useLayoutEffect(() => {
    isNearBottomRef.current = true
    endRef.current?.scrollIntoView({ behavior: 'instant' })
  }, [channelId])

  // Reset de error al cambiar de canal (el draft y replyTo viven en el store
  // y son específicos de cada canal, así que no hay que limpiarlos).
  useEffect(() => {
    setSendError(null)
  }, [channelId])

  // Si la respuesta citada ya no está en la cache (p. ej. el mensaje se borró
  // o se paginó fuera), cancelamos la respuesta para no enviar un
  // `parentMessageId` inválido.
  useEffect(() => {
    if (!channelId) return
    if (draftEntry.replyToId && !messagesById.has(draftEntry.replyToId)) {
      setDraftReply(channelId, null)
    }
  }, [channelId, draftEntry.replyToId, messagesById, setDraftReply])

  const handleReply = useCallback(
    (msg: ChannelMessage) => {
      if (!channelId) return
      setDraftReply(channelId, msg.id)
      inputRef.current?.focus()
    },
    [channelId, setDraftReply],
  )

  if (!channelId) {
    return (
      <div className="text-muted-foreground flex h-full min-h-0 flex-1 flex-col items-center justify-center overflow-hidden p-3 text-center text-sm">
        Selecciona un canal de texto.
      </div>
    )
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const text = draft.trim()
    if (!text || !accessToken || sending || !channelId) return
    setSendError(null)
    setSending(true)
    try {
      const created = await apiPostJson<Record<string, unknown>>(
        '/api/messages',
        accessToken,
        {
          channelId,
          text,
          messageType: 'text',
          ...(replyTo ? { parentMessageId: replyTo.id } : {}),
        },
      )
      appendChannelMessageFromPostResponse(channelId, created)
      clearDraft(channelId)
    } catch (err) {
      setSendError((err as Error).message || 'No se pudo enviar')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3"
        role="log"
        aria-label="Mensajes del canal"
      >
        {isLoading && messages.length === 0 ? (
          <div
            className="flex min-h-0 flex-1 flex-col gap-2"
            aria-busy="true"
            aria-label="Cargando mensajes"
          >
            {Array.from({ length: 6 }).map((_, i) => (
              <MessageSkeleton key={i} />
            ))}
          </div>
        ) : messages.length === 0 ? (
          <ChannelEmptyWelcome channelName={channelName} />
        ) : (
          <ul className="space-y-px">
            {messages.map((msg) => (
              <li key={msg.id}>
                <MessageItem
                  msg={msg}
                  onAuthorClick={onAuthorClick}
                  onReply={handleReply}
                  replyTarget={msg.parent_message_id ? messagesById.get(msg.parent_message_id) ?? null : null}
                />
              </li>
            ))}
          </ul>
        )}
        <div ref={endRef} aria-hidden />
      </div>

      <div className="border-border bg-background shrink-0 border-t p-3">
        {replyTo ? (
          <div className="bg-muted/60 border-primary/40 mb-2 flex items-center gap-2 rounded-lg border-l-2 px-3 py-1.5">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-primary/80">
                Respondiendo a {replyTo.profiles?.display_name || replyTo.profiles?.username || 'usuario'}
              </p>
              <p className="truncate text-xs text-muted-foreground">{replyTo.body.slice(0, 100)}</p>
            </div>
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground shrink-0"
              onClick={() => setDraftReply(channelId, null)}
              title="Cancelar respuesta"
            >
              <X className="size-4" />
            </button>
          </div>
        ) : null}
        {typingUsers.length > 0 ? (
          <p className="text-muted-foreground mb-1 truncate text-xs animate-pulse">
            {typingUsers.length === 1
              ? `${typingUsers[0].username || 'Alguien'} está escribiendo…`
              : `${typingUsers.map((u) => u.username || 'Alguien').join(', ')} están escribiendo…`}
          </p>
        ) : null}
        {sendError ? (
          <p className="text-destructive mb-2 text-xs" role="alert">
            {sendError}
          </p>
        ) : null}
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <div className="border-border/50 bg-muted flex min-w-0 flex-1 items-center gap-2 rounded-xl border px-4 py-2">
            <Input
              ref={inputRef}
              className="h-9 flex-1 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0 dark:bg-transparent"
              placeholder={replyTo ? 'Escribe tu respuesta…' : 'Escribir en el canal…'}
              value={draft}
              onChange={(e) => {
                setDraftBody(channelId, e.target.value)
                reportTyping()
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape' && replyTo) setDraftReply(channelId, null)
              }}
              maxLength={1000}
              disabled={sending || !accessToken}
              autoComplete="off"
              aria-label="Mensaje"
            />
          </div>
          <Button
            type="submit"
            size="icon"
            className="size-9 shrink-0 rounded-lg"
            disabled={sending || !draft.trim() || !accessToken}
          >
            {sending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Send className="size-4" aria-hidden />
            )}
            <span className="sr-only">Enviar</span>
          </Button>
        </form>
      </div>
    </div>
  )
}
