import { useCallback, useLayoutEffect, useRef, useState, type FormEvent } from 'react'
import { Hash, Loader2, Send } from 'lucide-react'
import { useChannelMessages } from '@/hooks/useChannelMessages'
import { apiPostJson } from '@/lib/api'
import { formatMessageTime } from '@/lib/formatMessageTime'
import { cn } from '@/lib/utils'
import { MessageSkeleton } from '@/components/chat/MessageSkeleton'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAppStore } from '@/store/useAppStore'
import type { ChannelMessage } from '@/types/models'

function authorInitials(msg: ChannelMessage): string {
  const p = msg.profiles
  const label = p?.display_name || p?.username || msg.author_id.slice(0, 6)
  const t = label.trim()
  if (!t) return '?'
  const parts = t.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase().slice(0, 2)
  }
  return t.slice(0, 2).toUpperCase()
}

function authorName(msg: ChannelMessage): string {
  return (
    msg.profiles?.display_name || msg.profiles?.username || `Usuario ${msg.author_id.slice(0, 6)}`
  )
}

function looksLikeImageUrl(text: string): boolean {
  if (!/^https?:\/\//i.test(text)) return false
  try {
    const u = new URL(text)
    return /\.(png|jpe?g|gif|webp|avif)$/i.test(u.pathname.split('?')[0] ?? '')
  } catch {
    return false
  }
}

function MessageAttachment({ msg }: { msg: ChannelMessage }) {
  const fromMedia =
    msg.media_data && msg.media_mime?.startsWith('image/') ? msg.media_data : null
  const fromBody =
    !fromMedia && msg.body.trim() && looksLikeImageUrl(msg.body.trim()) ? msg.body.trim() : null
  const src = fromMedia || fromBody
  if (!src) return null
  return (
    <a
      href={src}
      target="_blank"
      rel="noreferrer"
      className="border-border/50 bg-muted/20 mt-2 block max-w-md overflow-hidden rounded-xl border"
    >
      <img
        src={src}
        alt=""
        className="max-h-80 w-full object-contain"
        loading="lazy"
      />
    </a>
  )
}

export interface ChatAreaProps {
  channelId: string | null
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

export function ChatArea({ channelId }: ChatAreaProps) {
  const messages = useAppStore((s) => s.messages)
  const channels = useAppStore((s) => s.channels)
  const accessToken = useAppStore((s) => s.accessToken)
  const { isLoading } = useChannelMessages(channelId)
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
            {messages.map((msg) => {
              const bodyIsOnlyImageUrl =
                msg.body.trim() && looksLikeImageUrl(msg.body.trim()) && !msg.media_data
              return (
                <li key={msg.id}>
                  <article className="flex gap-2 rounded-md px-2 py-1.5 transition-colors duration-200 ease-in-out hover:bg-foreground/[0.04]">
                    <div
                      className={cn(
                        'flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                        'bg-primary/12 text-primary',
                      )}
                      aria-hidden
                    >
                      {authorInitials(msg)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <header className="flex flex-wrap items-baseline gap-x-2 gap-y-0">
                        <span className="text-foreground text-sm font-medium">{authorName(msg)}</span>
                        <time
                          className="text-muted-foreground text-xs"
                          dateTime={msg.created_at}
                          title={new Date(msg.created_at).toLocaleString('es')}
                        >
                          {formatMessageTime(msg.created_at)}
                        </time>
                        {msg.edited_at ? (
                          <span className="text-muted-foreground text-[11px]">(editado)</span>
                        ) : null}
                      </header>
                      {bodyIsOnlyImageUrl ? null : (
                        <p className="text-foreground mt-0.5 whitespace-pre-wrap break-words text-sm">
                          {msg.body}
                        </p>
                      )}
                      <MessageAttachment msg={msg} />
                    </div>
                  </article>
                </li>
              )
            })}
          </ul>
        )}
        <div ref={endRef} aria-hidden />
      </div>

      <div className="border-border bg-background shrink-0 border-t p-3">
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
              onChange={(e) => setDraft(e.target.value)}
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
