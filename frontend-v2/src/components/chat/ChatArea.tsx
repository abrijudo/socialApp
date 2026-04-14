import { useCallback, useLayoutEffect, useRef, useState, type FormEvent } from 'react'
import { Hash, Loader2, Send } from 'lucide-react'
import { useChannelMessages } from '@/hooks/useChannelMessages'
import { useTypingIndicator } from '@/hooks/useTypingIndicator'
import { apiPostJson } from '@/lib/api'
import { MessageItem } from '@/components/chat/MessageItem'
import { MessageSkeleton } from '@/components/chat/MessageSkeleton'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAppStore } from '@/store/useAppStore'

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
  const messages = useAppStore((s) => s.messages)
  const channels = useAppStore((s) => s.channels)
  const accessToken = useAppStore((s) => s.accessToken)
  const { isLoading } = useChannelMessages(channelId)
  const { typingUsers, reportTyping } = useTypingIndicator(channelId)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const isNearBottomRef = useRef(true)

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
    if (!text || !accessToken || sending) return
    setSendError(null)
    setSending(true)
    try {
      await apiPostJson<unknown>(
        '/api/messages',
        accessToken,
        { channelId, text, messageType: 'text' },
      )
      setDraft('')
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
                <MessageItem msg={msg} onAuthorClick={onAuthorClick} />
              </li>
            ))}
          </ul>
        )}
        <div ref={endRef} aria-hidden />
      </div>

      <div className="border-border bg-background shrink-0 border-t p-3">
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
              className="h-9 flex-1 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0 dark:bg-transparent"
              placeholder="Escribir en el canal…"
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value)
                reportTyping()
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
