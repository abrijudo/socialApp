import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Loader2, Menu, Send, X } from 'lucide-react'
import { useMobileNav } from '@/components/layout/MobileNavContext'
import { MessageItem } from '@/components/chat/MessageItem'
import { MessageSkeleton } from '@/components/chat/MessageSkeleton'
import { Button } from '@/components/ui/button'
import { appendDmMessageFromPostResponse } from '@/hooks/useDmMessages'
import { useTypingIndicator } from '@/hooks/useTypingIndicator'
import { apiPostJson } from '@/lib/api'
import {
  CHAT_COMPOSER_DOCK,
  CHAT_COMPOSER_INPUT,
  CHAT_COMPOSER_SEND_BUTTON,
  CHAT_COMPOSER_SHELL,
} from '@/lib/chatComposer'
import { LUX_ICON_STROKE, luxIconHeader, luxIconMessage } from '@/lib/luxIcon'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { useAppStore } from '@/store/useAppStore'
import type { ChannelMessage } from '@/types/models'

const EMPTY_DM_MESSAGES: ChannelMessage[] = []
const EMPTY_DRAFT = { body: '', replyToId: null as string | null }

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
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto p-6 text-center">
      <div
        className="from-primary/18 to-primary/5 text-primary mb-5 flex size-[4.5rem] shrink-0 items-center justify-center rounded-[1.1rem] bg-gradient-to-br text-lg font-semibold shadow-[inset_0_1px_0_0_oklch(1_0_0/0.12)]"
        aria-hidden
      >
        {initials}
      </div>
      <h3 className="text-foreground max-w-lg text-balance text-xl font-semibold tracking-tight sm:text-2xl">
        Este es el comienzo de tu historial con @{at}
      </h3>
      <p className="text-muted-foreground mt-3 max-w-md text-[0.9375rem] leading-relaxed text-balance">
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
  const messages = useAppStore((s) =>
    dmChannelId ? s.dmMessagesByChannel[dmChannelId] ?? EMPTY_DM_MESSAGES : EMPTY_DM_MESSAGES,
  )
  // La suscripción realtime y el fetch del historial viven en `AppLayout`
  // (`useDmMessages`), así este componente simplemente lee del cache y se
  // puede desmontar/remontar (por ejemplo al entrar/salir de voz) sin perder
  // mensajes ni disparar recargas.
  const isLoading = useAppStore((s) =>
    dmChannelId ? s.dmMessagesLoadingByChannel[dmChannelId] ?? false : false,
  )
  const draftEntry = useAppStore((s) =>
    dmChannelId ? s.drafts[dmChannelId] ?? EMPTY_DRAFT : EMPTY_DRAFT,
  )
  const setDraftBody = useAppStore((s) => s.setDraftBody)
  const setDraftReply = useAppStore((s) => s.setDraftReply)
  const clearDraft = useAppStore((s) => s.clearDraft)
  const { typingUsers, reportTyping } = useTypingIndicator(dmChannelId)
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

  useEffect(() => {
    setSendError(null)
  }, [dmChannelId])

  useEffect(() => {
    if (!dmChannelId) return
    if (draftEntry.replyToId && !messagesById.has(draftEntry.replyToId)) {
      setDraftReply(dmChannelId, null)
    }
  }, [dmChannelId, draftEntry.replyToId, messagesById, setDraftReply])

  const handleReply = useCallback(
    (msg: ChannelMessage) => {
      if (!dmChannelId) return
      setDraftReply(dmChannelId, msg.id)
      inputRef.current?.focus()
    },
    [dmChannelId, setDraftReply],
  )

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
    if (!text || !accessToken || sending || !dmChannelId) return
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
      appendDmMessageFromPostResponse(dmChannelId, created)
      clearDraft(dmChannelId)
    } catch (err) {
      setSendError((err as Error).message || 'No se pudo enviar')
    } finally {
      setSending(false)
    }
  }

  return (
    <main
      className="bg-background/85 flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
      aria-label="Mensajes directos"
    >
      <header className="lux-glass-header gap-2 sm:px-4">
        {mobile ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="md:hidden shrink-0"
            aria-label="Abrir menú de navegación"
            onClick={() => mobile.openNavSheet()}
          >
            <Menu className={cn(luxIconHeader)} strokeWidth={LUX_ICON_STROKE} aria-hidden />
          </Button>
        ) : null}
        <div
          className="from-primary/18 to-primary/5 text-primary lux-avatar flex size-8 shrink-0 items-center justify-center bg-gradient-to-br text-xs font-semibold"
          aria-hidden
        >
          {peerWelcomeInitials(peerLabel, peer?.username ?? undefined)}
        </div>
        <div className="flex min-w-0 flex-1 items-baseline gap-1.5">
          <span className="text-muted-foreground shrink-0 text-sm" aria-hidden>
            @
          </span>
          <span className="text-foreground/90 min-w-0 truncate text-[0.75rem] font-medium leading-tight tracking-tight sm:text-[0.78rem]">
            {peer?.username?.trim() || peerLabel || 'Mensaje directo'}
          </span>
        </div>
      </header>

      <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="from-muted/10 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto bg-gradient-to-b to-background px-3 pt-3 pb-0"
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
            <ul className="space-y-1">
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

        {(replyTo || typingUsers.length > 0 || sendError) && (
          <div className="shrink-0 space-y-2 border-t border-white/[0.05] bg-foreground/[0.03] px-3 pt-2 pb-0 [box-shadow:inset_0_1px_0_0_rgba(255,255,255,0.03)]">
            {replyTo ? (
              <div
                className="flex items-start gap-3 rounded-r-[10px] border border-white/[0.08] border-l-[0.5px] border-l-[color-mix(in_oklch,var(--muted-foreground)_50%,transparent)] bg-foreground/[0.045] py-2.5 pl-3.5 pr-2.5 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)]"
              >
                <div className="min-w-0 flex-1 space-y-1.5">
                  <p className="text-[0.65rem] font-medium uppercase tracking-[0.1em] text-muted-foreground/80">
                    Respondiendo
                  </p>
                  <p className="text-xs font-medium text-foreground/85">
                    {replyTo.profiles?.display_name || replyTo.profiles?.username || 'Usuario'}
                  </p>
                  <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground/70">
                    {replyTo.body.slice(0, 140)}
                  </p>
                </div>
                <button
                  type="button"
                  className="lux-icon-button text-muted-foreground mt-0.5 shrink-0 rounded-md p-1 transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
                  onClick={() => setDraftReply(dmChannelId, null)}
                  title="Cancelar respuesta"
                >
                  <X className={cn(luxIconMessage, 'size-4')} strokeWidth={LUX_ICON_STROKE} />
                </button>
              </div>
            ) : null}
            {typingUsers.length > 0 ? (
              <p className="text-muted-foreground truncate text-xs animate-pulse">
                {typingUsers.length === 1
                  ? `${typingUsers[0].username || 'Alguien'} está escribiendo…`
                  : `${typingUsers.map((u) => u.username || 'Alguien').join(', ')} están escribiendo…`}
              </p>
            ) : null}
            {sendError ? (
              <p className="text-destructive text-xs" role="alert">
                {sendError}
              </p>
            ) : null}
          </div>
        )}

        <div className={CHAT_COMPOSER_DOCK}>
          <form onSubmit={handleSubmit} className="flex w-full min-w-0 items-center gap-2">
            <div className={CHAT_COMPOSER_SHELL}>
              <Input
                ref={inputRef}
                className={CHAT_COMPOSER_INPUT}
                placeholder={replyTo ? 'Escribe tu respuesta…' : 'Escribir mensaje privado…'}
                value={draft}
                onChange={(e) => {
                  setDraftBody(dmChannelId, e.target.value)
                  reportTyping()
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape' && replyTo) setDraftReply(dmChannelId, null)
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
              className={cn(CHAT_COMPOSER_SEND_BUTTON, 'lux-icon-button')}
              disabled={sending || !draft.trim() || !accessToken}
            >
              {sending ? (
                <Loader2 className={cn(luxIconMessage, 'size-4 animate-spin')} strokeWidth={LUX_ICON_STROKE} aria-hidden />
              ) : (
                <Send className={cn(luxIconMessage, 'size-4')} strokeWidth={LUX_ICON_STROKE} aria-hidden />
              )}
              <span className="sr-only">Enviar</span>
            </Button>
          </form>
        </div>
      </div>
    </main>
  )
}
