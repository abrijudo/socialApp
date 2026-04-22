import { memo, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { FileText, Pencil, Reply, Smile, Trash2, X } from 'lucide-react'
import { apiDeleteJson, apiPatchJson, apiPostJson } from '@/lib/api'
import { formatMessageTime } from '@/lib/formatMessageTime'
import { isMediaPlaceholderBody } from '@/lib/messageBodyUtils'
import { isOptimisticMessageId } from '@/lib/optimisticMessage'
import { LUX_ICON_STROKE, luxIconMessage, luxIconSm } from '@/lib/luxIcon'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store/useAppStore'
import type { ChannelMessage } from '@/types/models'
import { firstHttpUrlInText } from '@/lib/extractFirstHttpUrl'
import { LinkPreview } from '@/components/chat/LinkPreview'
import { RichTextRenderer } from '@/components/chat/RichTextRenderer'

const QUICK_EMOJIS = ['👍', '❤️', '😂', '🔥', '👀', '🎉', '✅', '😮']

function authorInitials(msg: ChannelMessage): string {
  const p = msg.profiles
  const label = p?.display_name || p?.username || msg.author_id.slice(0, 6)
  const t = label.trim()
  if (!t) return '?'
  const parts = t.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase().slice(0, 2)
  return t.slice(0, 2).toUpperCase()
}

function authorName(msg: ChannelMessage): string {
  return msg.profiles?.display_name || msg.profiles?.username || `Usuario ${msg.author_id.slice(0, 6)}`
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

function MessageMediaBlock({ msg }: { msg: ChannelMessage }) {
  const body = msg.body.trim()
  if (msg.media_data && msg.media_mime?.startsWith('image/')) {
    return (
      <a
        href={msg.media_data}
        target="_blank"
        rel="noreferrer"
        className="border-border/60 bg-muted/25 mt-2 block w-fit max-w-sm overflow-hidden rounded-md border shadow-[inset_0_1px_0_0_oklch(1_0_0/0.06)] transition-[border-color,box-shadow] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:border-primary/20"
      >
        <img
          src={msg.media_data}
          alt=""
          className="max-h-80 w-full object-contain"
          loading="lazy"
        />
      </a>
    )
  }
  if (
    msg.media_data &&
    (msg.media_mime === 'application/pdf' || /\.pdf$/i.test((msg.media_name || '').trim()))
  ) {
    const label = (msg.media_name || 'documento.pdf').trim() || 'documento.pdf'
    return (
      <div className="border-border/60 bg-muted/50 mt-2 flex min-w-0 max-w-sm items-center gap-2.5 rounded-md border px-3 py-2.5 shadow-[inset_0_1px_0_0_oklch(1_0_0/0.04)]">
        <FileText
          className={cn(luxIconMessage, 'text-muted-foreground shrink-0')}
          strokeWidth={LUX_ICON_STROKE}
          aria-hidden
        />
        <span className="min-w-0 flex-1 truncate text-sm text-foreground/90" title={label}>
          {label}
        </span>
        <a
          href={msg.media_data}
          target="_blank"
          rel="noreferrer"
          className="text-primary hover:text-primary/90 shrink-0 text-xs font-medium underline-offset-2 hover:underline"
          download
        >
          Descargar
        </a>
      </div>
    )
  }
  if (!msg.media_data && body && looksLikeImageUrl(body)) {
    return (
      <a
        href={body}
        target="_blank"
        rel="noreferrer"
        className="border-border/60 bg-muted/25 mt-2 block w-fit max-w-sm overflow-hidden rounded-md border shadow-[inset_0_1px_0_0_oklch(1_0_0/0.06)] transition-[border-color,box-shadow] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:border-primary/20"
      >
        <img src={body} alt="" className="max-h-80 w-full object-contain" loading="lazy" />
      </a>
    )
  }
  return null
}

/**
 * Cita con estilo Discord: conector L (border), mini-avatar, @usuario, snippet
 * inmediatamente **encima** de la fila de nombre/hora del mensaje actual.
 */
function DiscordReplyCitation({
  target,
  align = 'left',
}: {
  target: ChannelMessage
  align?: 'left' | 'right'
}) {
  const uname = (target.profiles?.username || target.profiles?.display_name || 'usuario')
    .trim()
    .replace(/^@/, '')
  const replySnippetText =
    target.body.length > 100 ? `${target.body.slice(0, 100)}…` : target.body

  if (align === 'right') {
    return (
      <div
        className="relative z-0 mb-1.5 w-full min-w-0 pl-0.5 text-right"
        role="note"
        aria-label={`En respuesta a @${uname}`}
      >
        <div
          className="pointer-events-none absolute top-1.5 right-0.5 h-4 w-6 border-r-2 border-t-2 border-muted-foreground/50 rounded-tr-md"
          aria-hidden
        />
        <div
          className="group/cite flex min-w-0 cursor-pointer flex-row-reverse items-center justify-end gap-2 pr-8 text-xs text-muted-foreground transition-colors duration-200 hover:text-foreground"
          role="button"
          tabIndex={0}
        >
          <div className="line-clamp-1 min-w-0 flex-1 pl-1 text-right">
            <RichTextRenderer
              content={replySnippetText}
              variant="reply"
              className="!text-muted-foreground/90 transition-colors [color:unset] group-hover/cite:!text-foreground [&_p]:!text-inherit"
            />
          </div>
          <span className="shrink-0 font-semibold">
            @{uname}
          </span>
          <div
            className={cn(
              'flex size-4 shrink-0 items-center justify-center overflow-hidden rounded-full text-[0.5rem] font-semibold',
              'bg-muted/70 text-muted-foreground ring-1 ring-border/50',
            )}
          >
            {authorInitials(target)}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className="relative z-0 mb-1.5 w-full min-w-0 pl-0.5"
      role="note"
      aria-label={`En respuesta a @${uname}`}
    >
      <div
        className="pointer-events-none absolute top-1.5 left-0.5 h-4 w-6 border-l-2 border-t-2 border-muted-foreground/50 rounded-tl-md"
        aria-hidden
      />
      <div
        className="group/cite flex min-w-0 cursor-pointer items-center gap-2 pl-8 text-xs text-muted-foreground transition-colors duration-200 hover:text-foreground"
        role="button"
        tabIndex={0}
      >
        <div
          className={cn(
            'flex size-4 shrink-0 items-center justify-center overflow-hidden rounded-full text-[0.5rem] font-semibold',
            'bg-muted/70 text-muted-foreground ring-1 ring-border/50',
          )}
        >
          {authorInitials(target)}
        </div>
        <span className="shrink-0 font-semibold">
          @{uname}
        </span>
        <div className="line-clamp-1 min-w-0 flex-1 text-left">
          <RichTextRenderer
            content={replySnippetText}
            variant="reply"
            className="!text-muted-foreground/90 transition-colors [color:unset] group-hover/cite:!text-foreground [&_p]:!text-inherit"
          />
        </div>
      </div>
    </div>
  )
}

type GroupedReaction = { emoji: string; count: number; hasOwn: boolean }

function groupReactions(reactions: { userId: string; emoji: string }[], userId: string): GroupedReaction[] {
  const map = new Map<string, { count: number; hasOwn: boolean }>()
  for (const r of reactions) {
    const prev = map.get(r.emoji) ?? { count: 0, hasOwn: false }
    prev.count++
    if (r.userId === userId) prev.hasOwn = true
    map.set(r.emoji, prev)
  }
  return Array.from(map.entries()).map(([emoji, v]) => ({ emoji, ...v }))
}

export interface MessageItemProps {
  msg: ChannelMessage
  isDm?: boolean
  onAuthorClick?: (authorId: string) => void
  onReply?: (msg: ChannelMessage) => void
  replyTarget?: ChannelMessage | null
}

export const MessageItem = memo(function MessageItem({ msg, isDm, onAuthorClick, onReply, replyTarget }: MessageItemProps) {
  const userId = useAppStore((s) => s.userId)
  const accessToken = useAppStore((s) => s.accessToken)
  const isPending = isOptimisticMessageId(msg.id) || msg.localStatus === 'sending'
  const isFailed = msg.localStatus === 'failed'
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState('')
  const [editSaving, setEditSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const editInputRef = useRef<HTMLInputElement>(null)

  const isOwn = msg.author_id === userId

  const bodyTrimmed = useMemo(() => msg.body.trim(), [msg.body])
  const bodyIsOnlyImageUrl = useMemo(
    () => Boolean(bodyTrimmed) && looksLikeImageUrl(bodyTrimmed) && !msg.media_data,
    [bodyTrimmed, msg.media_data],
  )

  const linkPreviewUrl = useMemo(
    () => (!editing && !bodyIsOnlyImageUrl ? firstHttpUrlInText(msg.body) : null),
    [editing, bodyIsOnlyImageUrl, msg.body],
  )

  const showRichText = useMemo(
    () =>
      !bodyIsOnlyImageUrl &&
      !(isMediaPlaceholderBody(bodyTrimmed) && Boolean(msg.media_data)),
    [bodyIsOnlyImageUrl, bodyTrimmed, msg.media_data],
  )

  /** Burbuja “solo imagen” a pantalla: URL legacy, o placeholder [imagen] con adjunto. */
  const compactImageBubble = useMemo(
    () =>
      bodyIsOnlyImageUrl ||
      (isMediaPlaceholderBody(bodyTrimmed) &&
        Boolean(msg.media_data) &&
        (msg.media_mime?.startsWith('image/') || msg.message_type === 'image')),
    [bodyIsOnlyImageUrl, bodyTrimmed, msg.media_data, msg.media_mime, msg.message_type],
  )

  const reactions = msg.reactions
  const grouped = useMemo(
    () => groupReactions(reactions ?? [], userId),
    [reactions, userId],
  )

  const updateMsg = isDm ? useAppStore.getState().updateDmMessage : useAppStore.getState().updateMessage
  const removeMsg = isDm ? useAppStore.getState().removeDmMessage : useAppStore.getState().removeMessage

  // Los DMs viven en la tabla `dm_messages` y usan rutas específicas
  // (`/api/dm-messages/:id`). Sin esto, la edición/borrado apuntaba a la tabla
  // `messages` y el backend respondía 500 "Mensaje no encontrado".
  const messageMutationBase = isDm ? '/api/dm-messages' : '/api/messages'
  // Las reacciones solo están implementadas para mensajes de canal; los DM no
  // tienen tabla `dm_message_reactions`. Ocultamos el picker en DMs para
  // evitar un endpoint inexistente y no perder la reacción optimista.
  const supportsReactions = !isDm

  const keepActionBarVisible = emojiPickerOpen || confirmDelete

  async function handleReaction(emoji: string) {
    if (!accessToken || !supportsReactions || isPending) return
    setEmojiPickerOpen(false)
    const prev = [...(reactions ?? [])]
    const hasOwn = prev.some((r) => r.userId === userId && r.emoji === emoji)
    const optimistic = hasOwn
      ? prev.filter((r) => !(r.userId === userId && r.emoji === emoji))
      : [...prev, { userId, emoji }]
    updateMsg(msg.id, { reactions: optimistic })
    try {
      await apiPostJson(`/api/messages/${msg.id}/reactions`, accessToken, { emoji })
    } catch {
      updateMsg(msg.id, { reactions: prev })
    }
  }

  function startEdit() {
    if (isPending || isFailed) return
    setEditText(msg.body)
    setEditing(true)
    setTimeout(() => editInputRef.current?.focus(), 0)
  }

  async function saveEdit() {
    const text = editText.trim()
    if (!text || text === msg.body.trim() || !accessToken) {
      setEditing(false)
      return
    }
    setEditSaving(true)
    const prevBody = msg.body
    const prevEdited = msg.edited_at
    updateMsg(msg.id, { body: text, edited_at: new Date().toISOString() })
    try {
      await apiPatchJson(`${messageMutationBase}/${msg.id}`, accessToken, { text })
    } catch {
      updateMsg(msg.id, { body: prevBody, edited_at: prevEdited })
    } finally {
      setEditSaving(false)
      setEditing(false)
    }
  }

  function handleEditKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void saveEdit()
    } else if (e.key === 'Escape') {
      setEditing(false)
    }
  }

  async function handleDelete() {
    if (isOptimisticMessageId(msg.id)) {
      removeMsg(msg.id)
      setConfirmDelete(false)
      return
    }
    if (!accessToken) return
    removeMsg(msg.id)
    setConfirmDelete(false)
    try {
      await apiDeleteJson(`${messageMutationBase}/${msg.id}`, accessToken)
    } catch { /* Realtime will reconcile */ }
  }

  return (
    <article
      className={cn(
        'group/msg relative flex w-full max-w-full flex-col rounded-lg px-2 py-1.5',
        'transition-[background-color,box-shadow,opacity] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]',
        (isPending || isFailed) && 'opacity-80',
        isFailed && 'ring-destructive/35 ring-1',
        isDm ? 'px-0 py-2.5 sm:px-1' : 'hover:bg-muted/20',
        isDm && !isOwn && 'hover:bg-muted/15',
        isDm && isOwn && 'hover:bg-muted/12',
        isDm && isOwn && 'items-end',
        isDm && !isOwn && 'items-start',
      )}
      onMouseLeave={() => {
        setEmojiPickerOpen(false)
        setConfirmDelete(false)
      }}
    >
      {isDm ? (
        isOwn ? (
          <div className="flex w-full min-w-0 max-w-full justify-end">
            <div className="flex w-full min-w-0 max-w-[min(100%,26rem)] flex-col items-stretch gap-1 text-right">
              {editing ? (
                <div className="bg-primary/15 border-primary/30 flex w-full min-w-0 items-center gap-2 rounded-2xl rounded-tr-sm border px-3 py-2.5">
                  <input
                    ref={editInputRef}
                    type="text"
                    className="min-w-0 flex-1 border-0 bg-transparent text-base text-foreground outline-none focus:ring-0"
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    onKeyDown={handleEditKeyDown}
                    maxLength={1000}
                    disabled={editSaving}
                  />
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground shrink-0"
                    onClick={() => setEditing(false)}
                    title="Cancelar"
                  >
                    <X className={cn(luxIconMessage, 'size-4')} strokeWidth={LUX_ICON_STROKE} />
                  </button>
                </div>
              ) : (
                <div className="w-full min-w-0">
                  {replyTarget ? <DiscordReplyCitation target={replyTarget} align="right" /> : null}
                  <div
                  className={cn(
                    'w-full min-w-0 text-left',
                    'rounded-[1.05rem] rounded-tr-[0.55rem] border border-primary/25 bg-primary/12 text-foreground',
                    'shadow-[inset_0_1px_0_0_oklch(1_0_0/0.12),0_0_0_1px_oklch(0.62_0.12_280/0.08)]',
                    !compactImageBubble ? 'px-4 py-3' : 'overflow-hidden p-0',
                  )}
                >
                  {showRichText ? (
                    <RichTextRenderer content={msg.body} className="mt-0 first:[&_p]:mt-0" />
                  ) : null}
                  <div className="min-w-0 [&>a]:mt-0">
                    <MessageMediaBlock msg={msg} />
                  </div>
                  {linkPreviewUrl ? <LinkPreview key={`${msg.id}-pv`} url={linkPreviewUrl} /> : null}
                  <div
                    className={cn(
                      'flex flex-wrap items-center justify-end gap-x-1.5 gap-y-0 text-sm text-muted-foreground',
                      compactImageBubble ? 'px-3 pb-2.5 pt-1.5' : 'mt-1.5',
                    )}
                  >
                    <time dateTime={msg.created_at} title={new Date(msg.created_at).toLocaleString('es')}>
                      {formatMessageTime(msg.created_at)}
                    </time>
                    {msg.edited_at ? <span className="opacity-80">(editado)</span> : null}
                    {isPending || isFailed ? (
                      <span
                        className={cn('text-[0.65rem] font-medium', isFailed ? 'text-destructive' : 'text-muted-foreground')}
                      >
                        {isFailed ? 'No enviado' : 'Enviando…'}
                      </span>
                    ) : null}
                  </div>
                </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex w-full min-w-0 max-w-full items-start gap-3.5">
            <div
              className={cn('flex w-10 shrink-0 justify-center', replyTarget && 'pt-6')}
            >
              <div
                className={cn(
                  'lux-avatar flex size-10 items-center justify-center text-sm font-semibold',
                  'bg-primary/12 text-primary',
                )}
                aria-hidden
              >
                {authorInitials(msg)}
              </div>
            </div>
            <div className="min-w-0 flex-1">
              {replyTarget ? <DiscordReplyCitation target={replyTarget} align="left" /> : null}
              <header className="mb-2.5 flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 pl-0.5">
                <button
                  type="button"
                  className="text-foreground text-[0.9rem] font-semibold tracking-tight hover:underline"
                  onClick={() => onAuthorClick?.(msg.author_id)}
                >
                  {authorName(msg)}
                </button>
                <time
                  className="text-muted-foreground/90 text-[0.7rem] font-medium tabular-nums tracking-wide"
                  dateTime={msg.created_at}
                  title={new Date(msg.created_at).toLocaleString('es')}
                >
                  {formatMessageTime(msg.created_at)}
                </time>
                {msg.edited_at ? <span className="text-[0.65rem] text-muted-foreground/80">(editado)</span> : null}
                {isPending || isFailed ? (
                  <span
                    className={cn('text-[0.65rem] font-medium', isFailed ? 'text-destructive' : 'text-muted-foreground')}
                  >
                    {isFailed ? 'No enviado' : 'Enviando…'}
                  </span>
                ) : null}
              </header>
              {editing ? (
                <div className="bg-muted/90 border-border flex w-full min-w-0 max-w-full items-center gap-2 rounded-2xl rounded-tl-md border px-3 py-2.5">
                  <input
                    ref={editInputRef}
                    type="text"
                    className="min-w-0 flex-1 border-0 bg-transparent text-base text-foreground outline-none focus:ring-0"
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    onKeyDown={handleEditKeyDown}
                    maxLength={1000}
                    disabled={editSaving}
                  />
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground shrink-0"
                    onClick={() => setEditing(false)}
                    title="Cancelar"
                  >
                    <X className={cn(luxIconMessage, 'size-4')} strokeWidth={LUX_ICON_STROKE} />
                  </button>
                </div>
              ) : (
                <div
                  className={cn(
                    'max-w-full border border-border/70 bg-muted/50 text-foreground',
                    'rounded-[1.05rem] rounded-tl-[0.55rem] shadow-[inset_0_1px_0_0_oklch(1_0_0/0.06)]',
                    compactImageBubble && !replyTarget
                      ? 'overflow-hidden p-0'
                      : 'px-4 py-3',
                  )}
                >
                  {showRichText ? (
                    <RichTextRenderer content={msg.body} className="mt-0 first:[&_p]:mt-0" />
                  ) : null}
                  <div className="min-w-0 [&>a]:mt-0">
                    <MessageMediaBlock msg={msg} />
                  </div>
                  {linkPreviewUrl ? <LinkPreview key={`${msg.id}-pv`} url={linkPreviewUrl} /> : null}
                </div>
              )}
            </div>
          </div>
        )
      ) : (
        <div className="flex w-full min-w-0 gap-3.5">
          <div
            className={cn('flex w-10 shrink-0 justify-center', replyTarget && 'pt-6')}
          >
            <div
              className={cn(
                'lux-avatar flex size-10 items-center justify-center text-xs font-semibold',
                'bg-primary/12 text-primary',
              )}
              aria-hidden
            >
              {authorInitials(msg)}
            </div>
          </div>

          <div className="min-w-0 flex-1">
            {replyTarget ? <DiscordReplyCitation target={replyTarget} align="left" /> : null}
            <header className="mb-2 flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
              <button
                type="button"
                className="text-foreground/95 text-[0.9rem] font-semibold tracking-tight hover:underline"
                onClick={() => onAuthorClick?.(msg.author_id)}
              >
                {authorName(msg)}
              </button>
              <time
                className="text-muted-foreground/85 text-[0.65rem] font-medium tabular-nums tracking-wide"
                dateTime={msg.created_at}
                title={new Date(msg.created_at).toLocaleString('es')}
              >
                {formatMessageTime(msg.created_at)}
              </time>
              {msg.edited_at ? (
                <span className="text-[0.6rem] text-muted-foreground/75">(editado)</span>
              ) : null}
              {isPending || isFailed ? (
                <span
                  className={cn('text-[0.6rem] font-medium', isFailed ? 'text-destructive' : 'text-muted-foreground')}
                >
                  {isFailed ? 'No enviado' : 'Enviando…'}
                </span>
              ) : null}
            </header>

            {editing ? (
              <div className="mt-1.5 flex items-center gap-2">
                <input
                  ref={editInputRef}
                  type="text"
                  className="bg-muted/80 border-border/80 flex-1 rounded-[0.5rem] border px-2.5 py-1.5 text-[0.8125rem] text-foreground shadow-[inset_0_1px_0_0_oklch(1_0_0/0.04)] outline-none focus:ring-1 focus:ring-primary/30"
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  onKeyDown={handleEditKeyDown}
                  maxLength={1000}
                  disabled={editSaving}
                />
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => setEditing(false)}
                  title="Cancelar"
                >
                  <X className={cn(luxIconMessage, 'size-4')} strokeWidth={LUX_ICON_STROKE} />
                </button>
              </div>
            ) : (
              <>
                {showRichText ? (
                  <RichTextRenderer
                    content={msg.body}
                    className="max-w-[min(100%,65ch)] text-pretty text-[0.875rem] [&_p]:text-pretty"
                  />
                ) : null}
                <div className="min-w-0 max-w-full">
                  <MessageMediaBlock msg={msg} />
                </div>
                {linkPreviewUrl ? <LinkPreview key={`${msg.id}-pv`} url={linkPreviewUrl} /> : null}
              </>
            )}

            {grouped.length > 0 && !editing && supportsReactions && !isPending ? (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {grouped.map((g) => (
                  <button
                    key={g.emoji}
                    type="button"
                    onClick={() => void handleReaction(g.emoji)}
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[0.7rem] transition-[background-color,border-color,transform] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:scale-[1.02] active:scale-[0.98]',
                      g.hasOwn
                        ? 'border-primary/35 bg-primary/10 text-foreground shadow-[inset_0_1px_0_0_oklch(1_0_0/0.08)]'
                        : 'border-border/80 bg-muted/40 text-muted-foreground hover:border-border hover:bg-muted/60 hover:text-foreground/90',
                    )}
                  >
                    <span>{g.emoji}</span>
                    <span>{g.count}</span>
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setEmojiPickerOpen((p) => !p)}
                  className="inline-flex items-center rounded-full border border-border/80 bg-muted/40 px-1.5 py-0.5 text-[0.7rem] text-muted-foreground transition-[background-color,border-color,transform] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:border-border hover:bg-muted/60 hover:text-foreground/90"
                  title="Reaccionar"
                >
                  <Smile className={cn(luxIconSm, 'text-muted-foreground/85')} strokeWidth={LUX_ICON_STROKE} />
                </button>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {!editing && !isPending ? (
        <div
          className={cn(
            'border-border/80 bg-card/85 absolute -top-2.5 z-10 flex items-center gap-0.5 rounded-md border px-1 py-0.5',
            'shadow-[inset_0_1px_0_0_color-mix(in_oklch,var(--foreground)_6%,transparent),0_2px_12px_rgba(0,0,0,0.2)]',
            'translate-y-0.5 opacity-0 pointer-events-none backdrop-blur-sm transition-[opacity,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)]',
            'group-hover/msg:translate-y-0 group-hover/msg:opacity-100 group-hover/msg:pointer-events-auto',
            keepActionBarVisible && 'translate-y-0 opacity-100 pointer-events-auto',
            isDm && isOwn ? 'left-2 right-auto' : 'right-2',
          )}
        >
          {supportsReactions && !isFailed ? (
            <button
              type="button"
              onClick={() => setEmojiPickerOpen((p) => !p)}
              className="inline-flex size-7 items-center justify-center rounded-[0.3rem] text-muted-foreground transition-[background-color,color,transform,opacity] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-muted/45 hover:text-foreground active:scale-[0.95]"
              title="Reaccionar"
            >
              <Smile className={cn(luxIconMessage, 'text-muted-foreground/90')} strokeWidth={LUX_ICON_STROKE} />
            </button>
          ) : null}
          {onReply && !isFailed ? (
            <button
              type="button"
              onClick={() => onReply(msg)}
              className="inline-flex size-7 items-center justify-center rounded-[0.3rem] text-muted-foreground transition-[background-color,color,transform,opacity] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-muted/45 hover:text-foreground active:scale-[0.95]"
              title="Responder"
            >
              <Reply className={cn(luxIconMessage, 'text-muted-foreground/90')} strokeWidth={LUX_ICON_STROKE} />
            </button>
          ) : null}
          {isOwn ? (
            <>
              {!isFailed ? (
                <button
                  type="button"
                  onClick={startEdit}
                  className="inline-flex size-7 items-center justify-center rounded-[0.3rem] text-muted-foreground transition-[background-color,color,transform,opacity] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-muted/45 hover:text-foreground active:scale-[0.95]"
                  title="Editar"
                >
                  <Pencil className={cn(luxIconMessage, 'text-muted-foreground/90')} strokeWidth={LUX_ICON_STROKE} />
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="inline-flex size-7 items-center justify-center rounded-[0.3rem] text-destructive/75 transition-[background-color,color,transform,opacity] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-destructive/12 hover:text-destructive active:scale-[0.95]"
                title="Borrar"
              >
                <Trash2
                  className={cn(luxIconMessage, 'text-destructive/75')}
                  strokeWidth={LUX_ICON_STROKE}
                />
              </button>
            </>
          ) : null}
        </div>
      ) : null}

      {emojiPickerOpen && supportsReactions ? (
        <div
          className={cn(
            'absolute -top-10 z-20 flex items-center gap-0.5 rounded-[0.5rem] border border-border/90 bg-card px-1.5 py-1',
            'shadow-[inset_0_1px_0_0_oklch(1_0_0/0.06),0_8px_24px_oklch(0_0_0/0.35)]',
            isDm && isOwn ? 'left-2' : 'right-2',
          )}
        >
          {QUICK_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => void handleReaction(emoji)}
              className="inline-flex size-7 items-center justify-center rounded text-base hover:bg-muted"
            >
              {emoji}
            </button>
          ))}
        </div>
      ) : null}

      {confirmDelete ? (
        <div
          className={cn(
            'absolute -top-3 z-20 flex items-center gap-1.5 rounded-[0.45rem] border border-destructive/35 bg-card px-2 py-1',
            'shadow-[inset_0_1px_0_0_oklch(1_0_0/0.06),0_8px_24px_oklch(0_0_0/0.35)]',
            isDm && isOwn ? 'left-2' : 'right-2',
          )}
        >
          <span className="text-xs text-muted-foreground">¿Borrar?</span>
          <button
            type="button"
            onClick={() => void handleDelete()}
            className="rounded bg-destructive px-2 py-0.5 text-xs font-medium text-white hover:bg-destructive/90"
          >
            Sí
          </button>
          <button
            type="button"
            onClick={() => setConfirmDelete(false)}
            className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted/80"
          >
            No
          </button>
        </div>
      ) : null}
    </article>
  )
})
