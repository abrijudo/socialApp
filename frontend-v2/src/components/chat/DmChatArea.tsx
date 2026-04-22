import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Loader2, Menu, Send, X } from 'lucide-react'
import { toast } from 'sonner'
import { useMobileNav } from '@/components/layout/MobileNavContext'
import { MessageSkeleton } from '@/components/chat/MessageSkeleton'
import { VirtualizedMessageList } from '@/components/chat/VirtualizedMessageList'
import { ComposerAttachmentButton } from '@/components/chat/ComposerAttachmentButton'
import { TypingIndicator } from '@/components/chat/TypingIndicator'
import { Button } from '@/components/ui/button'
import { appendDmMessageFromPostResponse } from '@/hooks/useDmMessages'
import { useTypingIndicator } from '@/hooks/useTypingIndicator'
import { apiGetJson, apiPostJson } from '@/lib/api'
import {
  isAllowedComposerMime,
  MAX_COMPOSER_ATTACHMENT_BYTES,
} from '@/lib/attachmentConstants'
import { oldestPersistedMessage } from '@/lib/messagePagination'
import { uploadFileToMessagesMedia } from '@/lib/uploadMessagesMedia'
import {
  CHAT_COMPOSER_DOCK,
  CHAT_COMPOSER_INPUT,
  CHAT_COMPOSER_SEND_BUTTON,
  CHAT_COMPOSER_SHELL,
} from '@/lib/chatComposer'
import { LUX_ICON_STROKE, luxIconHeader, luxIconMessage } from '@/lib/luxIcon'
import { makeOptimisticChannelMessage } from '@/lib/optimisticMessage'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { useAppStore } from '@/store/useAppStore'
import type { ChannelMessage, DmMessagesResponse } from '@/types/models'

const EMPTY_DM_MESSAGES: ChannelMessage[] = []
const EMPTY_DRAFT = { body: '' }

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
  const clearDraft = useAppStore((s) => s.clearDraft)
  const replyingToMessage = useAppStore((s) => s.replyingToMessage)
  const setReplyingToMessage = useAppStore((s) => s.setReplyingToMessage)
  const userId = useAppStore((s) => s.userId)
  const profile = useAppStore((s) => s.profile)
  const appendDmChannelMessage = useAppStore((s) => s.appendDmChannelMessage)
  const updateDmMessage = useAppStore((s) => s.updateDmMessage)
  const hasMoreOlder = useAppStore((s) =>
    dmChannelId ? s.dmMessagesHasMoreByChannel[dmChannelId] === true : false,
  )
  const loadingOlder = useAppStore((s) =>
    dmChannelId ? s.dmMessagesLoadingOlderByChannel[dmChannelId] ?? false : false,
  )
  const readBaselineAt = useAppStore((s) =>
    dmChannelId ? s.viewEnterReadBaseline[dmChannelId] ?? null : null,
  )
  const { reportTyping, stopTyping } = useTypingIndicator(dmChannelId)
  const [isPosting, setIsPosting] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [sendError, setSendError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const messagesById = useMemo(() => {
    const map = new Map<string, ChannelMessage>()
    for (const m of messages) map.set(m.id, m)
    return map
  }, [messages])

  const draft = draftEntry.body
  const replyTo: ChannelMessage | null =
    replyingToMessage?.channel_id === dmChannelId ? replyingToMessage : null

  const peer = dmChannels.find((d) => d.id === dmChannelId)?.otherUser
  const peerLabel =
    peer?.display_name?.trim() || peer?.username || (peer ? `Usuario ${peer.user_id.slice(0, 6)}` : '')

  useEffect(() => {
    setSendError(null)
  }, [dmChannelId])

  useEffect(() => {
    if (!dmChannelId) return
    const r = useAppStore.getState().replyingToMessage
    if (r && r.channel_id !== dmChannelId) setReplyingToMessage(null)
  }, [dmChannelId, setReplyingToMessage])

  useEffect(() => {
    if (!dmChannelId || !replyTo) return
    if (!messagesById.has(replyTo.id)) setReplyingToMessage(null)
  }, [dmChannelId, replyTo, messagesById, setReplyingToMessage])

  const handleReply = useCallback(
    (msg: ChannelMessage) => {
      setReplyingToMessage(msg)
      inputRef.current?.focus()
    },
    [setReplyingToMessage],
  )

  const handleAttachment = useCallback(
    async (file: File) => {
      if (!dmChannelId || !accessToken || isUploading || isPosting) return
      if (file.size > MAX_COMPOSER_ATTACHMENT_BYTES) {
        toast.error('El archivo supera 5 MB.')
        return
      }
      if (!isAllowedComposerMime(file.type, file.name)) {
        toast.error('Solo imágenes o PDF.')
        return
      }
      stopTyping()
      setSendError(null)
      const caption = draft.trim()
      const parentId = replyTo?.id ?? null
      const messageType: 'image' | 'file' = file.type.startsWith('image/') ? 'image' : 'file'
      const placeholderBody =
        caption || (messageType === 'image' ? '[imagen]' : '[archivo]')
      const previewUrl = URL.createObjectURL(file)
      const opt = makeOptimisticChannelMessage(
        dmChannelId,
        userId,
        placeholderBody,
        profile,
        parentId,
        {
          messageType,
          mediaData: previewUrl,
          mediaMime: file.type || 'application/octet-stream',
          mediaName: file.name,
        },
      )
      appendDmChannelMessage(dmChannelId, opt)
      setIsUploading(true)
      setUploadProgress(0)
      try {
        const { url } = await uploadFileToMessagesMedia(file, accessToken, setUploadProgress)
        const created = await apiPostJson<Record<string, unknown>>(
          `/api/dm/${dmChannelId}/messages`,
          accessToken,
          {
            text: caption,
            messageType,
            mediaUrl: url,
            mediaMime: file.type || undefined,
            mediaName: file.name,
            ...(parentId ? { parentMessageId: parentId } : {}),
          },
        )
        URL.revokeObjectURL(previewUrl)
        appendDmMessageFromPostResponse(dmChannelId, created)
        clearDraft(dmChannelId)
        setReplyingToMessage(null)
      } catch (err) {
        URL.revokeObjectURL(previewUrl)
        updateDmMessage(opt.id, { localStatus: 'failed' })
        const message = (err as Error).message || 'No se pudo subir o enviar'
        setSendError(message)
        toast.error(message)
      } finally {
        setIsUploading(false)
        setUploadProgress(0)
      }
    },
    [
      accessToken,
      appendDmChannelMessage,
      clearDraft,
      draft,
      dmChannelId,
      isPosting,
      isUploading,
      profile,
      replyTo?.id,
      setReplyingToMessage,
      stopTyping,
      updateDmMessage,
      userId,
    ],
  )

  const loadOlderMessages = useCallback(async () => {
    if (!dmChannelId || !accessToken) return
    const st = useAppStore.getState()
    const list = st.dmMessagesByChannel[dmChannelId] ?? []
    if (!list.length) return
    if (st.dmMessagesHasMoreByChannel[dmChannelId] !== true) return
    if (st.dmMessagesLoadingOlderByChannel[dmChannelId]) return
    const oldest = oldestPersistedMessage(list)
    if (!oldest) return
    st.setDmMessagesLoadingOlder(dmChannelId, true)
    try {
      const data = await apiGetJson<DmMessagesResponse>(
        `/api/dm/${dmChannelId}/messages?limit=50&before=${encodeURIComponent(oldest.created_at)}`,
        accessToken,
      )
      st.prependDmChannelMessages(dmChannelId, data.messages ?? [], data.hasMore)
    } catch {
      /* reintento al volver arriba */
    } finally {
      st.setDmMessagesLoadingOlder(dmChannelId, false)
    }
  }, [dmChannelId, accessToken])

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
    if (!text || !accessToken || isPosting || isUploading || !dmChannelId) return
    stopTyping()
    setSendError(null)
    setIsPosting(true)
    const parentId = replyTo?.id ?? null
    const opt = makeOptimisticChannelMessage(dmChannelId, userId, text, profile, parentId)
    appendDmChannelMessage(dmChannelId, opt)
    clearDraft(dmChannelId)
    try {
      const created = await apiPostJson<Record<string, unknown>>(
        `/api/dm/${dmChannelId}/messages`,
        accessToken,
        {
          text,
          ...(parentId ? { parentMessageId: parentId } : {}),
        },
      )
      appendDmMessageFromPostResponse(dmChannelId, created)
      setReplyingToMessage(null)
    } catch (err) {
      updateDmMessage(opt.id, { localStatus: 'failed' })
      setSendError((err as Error).message || 'No se pudo enviar')
    } finally {
      setIsPosting(false)
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
          className="from-muted/10 flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden bg-gradient-to-b to-background px-3 pt-3 pb-0"
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
            <VirtualizedMessageList
              listKey={dmChannelId}
              messages={messages}
              messagesById={messagesById}
              onReply={handleReply}
              isDm
              readBaselineAt={readBaselineAt}
              hasMoreOlder={hasMoreOlder}
              loadingOlder={loadingOlder}
              onLoadOlder={loadOlderMessages}
              className="min-h-0 w-full min-w-0 flex-1"
            />
          )}
        </div>

        {sendError ? (
          <div className="border-border/60 bg-muted/20 shrink-0 border-t px-3 pt-2 [box-shadow:inset_0_1px_0_0_color-mix(in_oklch,var(--foreground)_4%,transparent)]">
            <p className="text-destructive text-xs" role="alert">
              {sendError}
            </p>
          </div>
        ) : null}

        <TypingIndicator channelId={dmChannelId} />

        {replyTo ? (
          <div className="border-border/50 bg-card/30 shrink-0 border-t border-border/30 px-3 pt-2 pb-1.5 [box-shadow:inset_0_1px_0_0_color-mix(in_oklch,var(--foreground)_3%,transparent)]">
            <div className="border-border/60 bg-muted/25 flex items-start gap-2.5 rounded-lg border px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-[0.65rem] font-medium text-muted-foreground/90">
                  Respondiendo a{' '}
                  <span className="text-foreground/90">
                    @{(replyTo.profiles?.username || replyTo.profiles?.display_name || 'usuario').replace(/^@/, '')}
                  </span>
                </p>
                <p className="text-muted-foreground line-clamp-1 text-xs">{replyTo.body.slice(0, 120)}</p>
              </div>
              <button
                type="button"
                className="lux-icon-button text-muted-foreground hover:bg-muted/50 shrink-0 rounded-md p-1 transition-colors hover:text-foreground"
                onClick={() => setReplyingToMessage(null)}
                title="Cancelar respuesta"
              >
                <X className={cn(luxIconMessage, 'size-4')} strokeWidth={LUX_ICON_STROKE} />
              </button>
            </div>
          </div>
        ) : null}

        <div className={CHAT_COMPOSER_DOCK}>
          <form onSubmit={handleSubmit} className="flex w-full min-w-0 items-center gap-2">
            <div className={cn(CHAT_COMPOSER_SHELL, 'gap-2')}>
              <ComposerAttachmentButton
                onFileSelected={handleAttachment}
                disabled={!accessToken || isPosting || isUploading}
              />
              <Input
                ref={inputRef}
                className={CHAT_COMPOSER_INPUT}
                placeholder={
                  isUploading
                    ? 'Subiendo archivo…'
                    : replyTo
                      ? 'Escribe tu respuesta…'
                      : 'Escribir mensaje privado…'
                }
                value={draft}
                onChange={(e) => {
                  setDraftBody(dmChannelId, e.target.value)
                  reportTyping()
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape' && replyTo) setReplyingToMessage(null)
                }}
                maxLength={1000}
                disabled={!accessToken || isUploading}
                autoComplete="off"
                aria-label="Mensaje"
              />
              {isUploading && uploadProgress > 0 && uploadProgress < 100 ? (
                <span className="text-muted-foreground w-8 shrink-0 text-[0.65rem] tabular-nums" aria-hidden>
                  {uploadProgress}%
                </span>
              ) : null}
            </div>
            <Button
              type="submit"
              size="icon"
              className={cn(CHAT_COMPOSER_SEND_BUTTON, 'lux-icon-button')}
              disabled={isPosting || isUploading || !draft.trim() || !accessToken}
            >
              {isPosting || isUploading ? (
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
