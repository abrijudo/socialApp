import { useCallback, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Loader2, Menu, Send, User, X } from 'lucide-react'
import { useMobileNav } from '@/components/layout/MobileNavContext'
import { MessageItem } from '@/components/chat/MessageItem'
import { MessageSkeleton } from '@/components/chat/MessageSkeleton'
import { Button } from '@/components/ui/button'
import { useDmMessages } from '@/hooks/useDmMessages'
import { useTypingIndicator } from '@/hooks/useTypingIndicator'
import { apiPostJson } from '@/lib/api'
import { Input } from '@/components/ui/input'
import { useAppStore } from '@/store/useAppStore'

function peerWelcomeInitials(displayName: string, username: string | undefined): string {
  const label = displayName.trim() || username || '?'
  const t = label.trim()
  if (!t) return '?'
  const parts = t.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase().slice(0, 2)
  }
  return t.slice(0, 2).toUpperCase()
}

function DmEmptyWelcome({
  displayName,
  username,
}: {
  displayName: string
  username: string | undefined
}) {
  const at = username?.trim() || displayName.trim() || 'usuario'
  const initials = peerWelcomeInitials(displayName, username)

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto p-3 text-center">
      <div
        className="bg-muted mb-4 flex size-20 shrink-0 items-center justify-center rounded-[20px] text-lg font-semibold text-primary"
        aria-hidden
      >
        {initials}
      </div>
      <h3 className="text-foreground max-w-lg text-2xl font-semibold tracking-tight">
        Este es el comienzo de tu historial de mensajes directos con @{at}
      </h3>
      <p className="text-muted-foreground mt-2 max-w-md text-sm leading-relaxed">
        Enviá un mensaje para iniciar la conversación.
      </p>
    </div>
  )
}

export interface DmChatAreaProps {
  dmChannelId: string | null
}

export function DmChatArea({ dmChannelId }: DmChatAreaProps) {
  const mobile = useMobileNav()
  const accessToken = useAppStore((s) => s.accessToken)
  const dmChannels = useAppStore((s) => s.dmChannels)
  const messages = useAppStore((s) => s.dmMessages)
  const { isLoading, appendFromPostResponse } = useDmMessages(dmChannelId)
  const { typingUsers, reportTyping } = useTypingIndicator(dmChannelId)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [replyTo, setReplyTo] = useState<import('@/types/models').ChannelMessage | null>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const isNearBottomRef = useRef(true)
  const inputRef = useRef<HTMLInputElement>(null)

  const messagesById = useMemo(() => {
    const map = new Map<string, import('@/types/models').ChannelMessage>()
    for (const m of messages) map.set(m.id, m)
    return map
  }, [messages])

  const peer = dmChannels.find((d) => d.id === dmChannelId)?.otherUser
  const peerLabel =
    peer?.display_name?.trim() || peer?.username || (peer ? `Usuario ${peer.user_id.slice(0, 6)}` : '')

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
  }, [dmChannelId])

  if (!dmChannelId) {
    return (
      <div className="text-muted-foreground flex h-full min-h-0 flex-1 flex-col items-center justify-center overflow-hidden p-3 text-center text-sm">
        Selecciona una conversación.
      </div>
    )
  }

  function handleReply(msg: import('@/types/models').ChannelMessage) {
    setReplyTo(msg)
    inputRef.current?.focus()
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const text = draft.trim()
    if (!text || !accessToken || sending) return
    setSendError(null)
    setSending(true)
    try {
      const created = await apiPostJson<Record<string, unknown>>(
        `/api/dm/${dmChannelId}/messages`,
        accessToken,
        {
          text,
          ...(replyTo ? { parentMessageId: replyTo.id } : {}),
        },
      )
      appendFromPostResponse(created)
      setDraft('')
      setReplyTo(null)
    } catch (err) {
      setSendError((err as Error).message || 'No se pudo enviar')
    } finally {
      setSending(false)
    }
  }

  return (
    <main
      className="bg-background flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
      aria-label="Mensajes directos"
    >
      <header className="border-border flex h-12 shrink-0 items-center gap-2 border-b px-3 shadow-sm sm:px-4">
        {mobile ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="md:hidden shrink-0"
            aria-label="Abrir menú de navegación"
            onClick={() => mobile.openNavSheet()}
          >
            <Menu className="size-5" aria-hidden />
          </Button>
        ) : null}
        <User className="text-muted-foreground size-4 shrink-0" aria-hidden />
        <span className="text-foreground min-w-0 flex-1 truncate text-sm font-semibold">
          {peerLabel || 'Mensaje directo'}
        </span>
        {peer?.username ? (
          <span className="text-muted-foreground ml-2 truncate text-xs">@{peer.username}</span>
        ) : null}
      </header>

      <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3"
          role="log"
          aria-label="Mensajes privados"
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
            <DmEmptyWelcome
              displayName={peerLabel}
              username={peer?.username ?? undefined}
            />
          ) : (
            <ul className="space-y-px">
              {messages.map((msg) => (
                <li key={msg.id}>
                  <MessageItem
                    msg={msg}
                    isDm
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
                onClick={() => setReplyTo(null)}
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
                placeholder={replyTo ? 'Escribe tu respuesta…' : 'Escribir mensaje privado…'}
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value)
                  reportTyping()
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape' && replyTo) setReplyTo(null)
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
    </main>
  )
}
