import { useCallback, useLayoutEffect, useRef, useState, type FormEvent } from 'react'
import { Loader2, Menu, Send, User } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useMobileNav } from '@/components/layout/MobileNavContext'
import { MessageSkeleton } from '@/components/chat/MessageSkeleton'
import { Button } from '@/components/ui/button'
import { useDmMessages } from '@/hooks/useDmMessages'
import { apiPostJson } from '@/lib/api'
import { formatMessageTime } from '@/lib/formatMessageTime'
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
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const isNearBottomRef = useRef(true)

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
        { text },
      )
      appendFromPostResponse(created)
      setDraft('')
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
              <article
                className="flex gap-2 rounded-md px-2 py-1.5 transition-colors duration-200 ease-in-out hover:bg-foreground/[0.04]"
              >
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
                  <p className="text-foreground mt-0.5 whitespace-pre-wrap break-words text-sm">
                    {msg.body}
                  </p>
                </div>
              </article>
                </li>
              ))}
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
                placeholder="Escribir mensaje privado…"
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
    </main>
  )
}
