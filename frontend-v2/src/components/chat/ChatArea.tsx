import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Hash, Loader2, Send, X } from 'lucide-react'
import { toast } from 'sonner'
import { appendChannelMessageFromPostResponse } from '@/hooks/useChannelMessages'
import { useTypingIndicator } from '@/hooks/useTypingIndicator'
import { apiGetJson, apiPostJson } from '@/lib/api'
import {
  isAllowedComposerMime,
  MAX_COMPOSER_ATTACHMENT_BYTES,
} from '@/lib/attachmentConstants'
import { oldestPersistedMessage } from '@/lib/messagePagination'
import { uploadFileToMessagesMedia } from '@/lib/uploadMessagesMedia'
import { MessageSkeleton } from '@/components/chat/MessageSkeleton'
import { VirtualizedMessageList } from '@/components/chat/VirtualizedMessageList'
import { ComposerAttachmentButton } from '@/components/chat/ComposerAttachmentButton'
import { TypingIndicator } from '@/components/chat/TypingIndicator'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  CHAT_COMPOSER_DOCK,
  CHAT_COMPOSER_INPUT,
  CHAT_COMPOSER_SEND_BUTTON,
  CHAT_COMPOSER_SHELL,
} from '@/lib/chatComposer'
import { LUX_ICON_STROKE, luxIconMessage } from '@/lib/luxIcon'
import { makeOptimisticChannelMessage } from '@/lib/optimisticMessage'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store/useAppStore'
import type { ChannelMessage, ChannelMessagesResponse } from '@/types/models'

// Array compartido para evitar nueva referencia cuando no hay mensajes cacheados;
// así el selector devuelve la misma instancia y no dispara re-renders.
const EMPTY_MESSAGES: ChannelMessage[] = []
const EMPTY_DRAFT = { body: '' }

export interface ChatAreaProps {
  channelId: string | null
  onAuthorClick?: (authorId: string) => void
}

function ChannelEmptyWelcome({ channelName }: { channelName: string }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto p-6 text-center">
      <div
        className="mb-5 flex size-[4.5rem] shrink-0 items-center justify-center rounded-[1.1rem] border border-border/45 bg-gradient-to-b from-muted/50 to-muted/20 p-[1px] shadow-[inset_0_1px_0_0_oklch(1_0_0/0.08)]"
        aria-hidden
      >
        <div className="bg-card/30 flex h-full w-full items-center justify-center rounded-[1.02rem]">
          <Hash className="lux-icon size-9 text-primary/75" strokeWidth={LUX_ICON_STROKE} />
        </div>
      </div>
      <h3 className="text-foreground max-w-lg text-balance text-xl font-semibold tracking-tight sm:text-2xl">
        Te damos la bienvenida a #{channelName}
      </h3>
      <p className="text-muted-foreground mt-3 max-w-md text-[0.9375rem] leading-relaxed text-balance">
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
  const clearDraft = useAppStore((s) => s.clearDraft)
  const replyingToMessage = useAppStore((s) => s.replyingToMessage)
  const setReplyingToMessage = useAppStore((s) => s.setReplyingToMessage)
  const userId = useAppStore((s) => s.userId)
  const profile = useAppStore((s) => s.profile)
  const appendChannelMessage = useAppStore((s) => s.appendChannelMessage)
  const updateMessage = useAppStore((s) => s.updateMessage)
  const hasMoreOlder = useAppStore((s) =>
    channelId ? s.messagesHasMoreByChannel[channelId] === true : false,
  )
  const loadingOlder = useAppStore((s) =>
    channelId ? s.messagesLoadingOlderByChannel[channelId] ?? false : false,
  )
  const readBaselineAt = useAppStore((s) =>
    channelId ? s.viewEnterReadBaseline[channelId] ?? null : null,
  )
  const { reportTyping, stopTyping } = useTypingIndicator(channelId)
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
    replyingToMessage?.channel_id === channelId ? replyingToMessage : null

  const activeChannel = channelId ? channels.find((c) => c.id === channelId) : undefined
  const channelName = activeChannel?.name?.trim() || 'canal'

  // Reset de error al cambiar de canal (el draft vive en el store por canal).
  useEffect(() => {
    setSendError(null)
  }, [channelId])

  useEffect(() => {
    if (!channelId) return
    const r = useAppStore.getState().replyingToMessage
    if (r && r.channel_id !== channelId) setReplyingToMessage(null)
  }, [channelId, setReplyingToMessage])

  useEffect(() => {
    if (!channelId || !replyTo) return
    if (!messagesById.has(replyTo.id)) setReplyingToMessage(null)
  }, [channelId, replyTo, messagesById, setReplyingToMessage])

  const handleReply = useCallback(
    (msg: ChannelMessage) => {
      setReplyingToMessage(msg)
      inputRef.current?.focus()
    },
    [setReplyingToMessage],
  )

  const handleAttachment = useCallback(
    async (file: File) => {
      if (!channelId || !accessToken || isUploading || isPosting) return
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
        channelId,
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
      appendChannelMessage(channelId, opt)
      setIsUploading(true)
      setUploadProgress(0)
      try {
        const { url } = await uploadFileToMessagesMedia(file, accessToken, setUploadProgress)
        const created = await apiPostJson<Record<string, unknown>>(
          '/api/messages',
          accessToken,
          {
            channelId,
            text: caption,
            messageType,
            mediaUrl: url,
            mediaMime: file.type || undefined,
            mediaName: file.name,
            ...(parentId ? { parentMessageId: parentId } : {}),
          },
        )
        URL.revokeObjectURL(previewUrl)
        appendChannelMessageFromPostResponse(channelId, created)
        clearDraft(channelId)
        setReplyingToMessage(null)
      } catch (err) {
        URL.revokeObjectURL(previewUrl)
        updateMessage(opt.id, { localStatus: 'failed' })
        const msg = (err as Error).message || 'No se pudo subir o enviar'
        setSendError(msg)
        toast.error(msg)
      } finally {
        setIsUploading(false)
        setUploadProgress(0)
      }
    },
    [
      accessToken,
      appendChannelMessage,
      channelId,
      clearDraft,
      draft,
      isPosting,
      isUploading,
      profile,
      replyTo?.id,
      setReplyingToMessage,
      stopTyping,
      updateMessage,
      userId,
    ],
  )

  const loadOlderMessages = useCallback(async () => {
    if (!channelId || !accessToken) return
    const st = useAppStore.getState()
    const list = st.messagesByChannel[channelId] ?? []
    if (!list.length) return
    if (st.messagesHasMoreByChannel[channelId] !== true) return
    if (st.messagesLoadingOlderByChannel[channelId]) return
    const oldest = oldestPersistedMessage(list)
    if (!oldest) return
    st.setChannelMessagesLoadingOlder(channelId, true)
    try {
      const data = await apiGetJson<ChannelMessagesResponse>(
        `/api/messages/${channelId}?limit=50&before=${encodeURIComponent(oldest.created_at)}`,
        accessToken,
      )
      st.prependChannelMessages(channelId, data.messages ?? [], data.hasMore)
    } catch {
      /* reintento al volver al inicio del scroll */
    } finally {
      st.setChannelMessagesLoadingOlder(channelId, false)
    }
  }, [channelId, accessToken])

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
    if (!text || !accessToken || isPosting || isUploading || !channelId) return
    stopTyping()
    setSendError(null)
    setIsPosting(true)
    const parentId = replyTo?.id ?? null
    const opt = makeOptimisticChannelMessage(channelId, userId, text, profile, parentId)
    appendChannelMessage(channelId, opt)
    clearDraft(channelId)
    try {
      const created = await apiPostJson<Record<string, unknown>>(
        '/api/messages',
        accessToken,
        {
          channelId,
          text,
          messageType: 'text',
          ...(parentId ? { parentMessageId: parentId } : {}),
        },
      )
      appendChannelMessageFromPostResponse(channelId, created)
      setReplyingToMessage(null)
    } catch (err) {
      updateMessage(opt.id, { localStatus: 'failed' })
      setSendError((err as Error).message || 'No se pudo enviar')
    } finally {
      setIsPosting(false)
    }
  }

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <div
        className="from-background flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden bg-gradient-to-b via-background to-muted/8 px-3 pt-3 pb-0"
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
          <VirtualizedMessageList
            listKey={channelId}
            messages={messages}
            messagesById={messagesById}
            onReply={handleReply}
            onAuthorClick={onAuthorClick}
            isDm={false}
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

      <TypingIndicator channelId={channelId} />

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
                    : 'Escribir en el canal…'
              }
              value={draft}
              onChange={(e) => {
                setDraftBody(channelId, e.target.value)
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
  )
}
