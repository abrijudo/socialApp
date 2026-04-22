import { memo, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { CornerUpLeft, Pencil, Reply, Smile, Trash2, X } from 'lucide-react'
import { apiDeleteJson, apiPatchJson, apiPostJson } from '@/lib/api'
import { formatMessageTime } from '@/lib/formatMessageTime'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store/useAppStore'
import type { ChannelMessage } from '@/types/models'

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

function MessageAttachment({ msg }: { msg: ChannelMessage }) {
  const fromMedia = msg.media_data && msg.media_mime?.startsWith('image/') ? msg.media_data : null
  const body = msg.body.trim()
  const fromBody = !fromMedia && body && looksLikeImageUrl(body) ? body : null
  const src = fromMedia || fromBody
  if (!src) return null
  return (
    <a
      href={src}
      target="_blank"
      rel="noreferrer"
      className="border-border/50 bg-muted/20 mt-2 block max-w-md overflow-hidden rounded-xl border"
    >
      <img src={src} alt="" className="max-h-80 w-full object-contain" loading="lazy" />
    </a>
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
  const [hovered, setHovered] = useState(false)
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

  async function handleReaction(emoji: string) {
    if (!accessToken || !supportsReactions) return
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
    if (!accessToken) return
    removeMsg(msg.id)
    setConfirmDelete(false)
    try {
      await apiDeleteJson(`${messageMutationBase}/${msg.id}`, accessToken)
    } catch { /* Realtime will reconcile */ }
  }

  const replyToSnippet = replyTarget ? (
    <div
      className={cn(
        'mb-2 flex min-w-0 items-start gap-1.5 border-l-2 border-primary/50 pl-2.5 text-left text-sm text-muted-foreground',
        isDm && isOwn && 'border-primary/40',
      )}
    >
      <CornerUpLeft className="mt-0.5 size-3.5 shrink-0 opacity-60" />
      <div className="min-w-0">
        <span className="font-medium text-foreground/90">{authorName(replyTarget)}</span>
        <span className="ml-1.5 min-w-0 break-words opacity-80">
          {replyTarget.body.slice(0, 100)}
          {replyTarget.body.length > 100 ? '…' : ''}
        </span>
      </div>
    </div>
  ) : null

  return (
    <article
      className={cn(
        'group relative flex w-full max-w-full flex-col rounded-md px-2 py-1.5 transition-colors duration-200 ease-in-out',
        isDm
          ? 'px-0 py-2.5 sm:px-1 hover:bg-transparent'
          : 'hover:bg-foreground/[0.04]',
        isDm && isOwn && 'items-end',
        isDm && !isOwn && 'items-start',
      )}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => {
        setHovered(false)
        setEmojiPickerOpen(false)
        setConfirmDelete(false)
      }}
    >
      {replyTarget && !isDm ? (
        <div
          className={cn(
            'mb-1 flex min-w-0 max-w-full items-center gap-1.5 pl-4 text-xs text-muted-foreground',
          )}
        >
          <CornerUpLeft className="size-3 shrink-0 opacity-60" />
          <span className="font-medium text-foreground/70">{authorName(replyTarget)}</span>
          <span className="min-w-0 flex-1 truncate opacity-70">
            {replyTarget.body.slice(0, 80)}
            {replyTarget.body.length > 80 ? '…' : ''}
          </span>
        </div>
      ) : null}

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
                    <X className="size-4" />
                  </button>
                </div>
              ) : (
                <div
                  className={cn(
                    'w-full min-w-0 text-left',
                    'rounded-2xl rounded-tr-md border border-primary/30 bg-primary/20 text-foreground shadow-sm',
                    !bodyIsOnlyImageUrl ? 'px-3.5 py-2.5' : 'overflow-hidden p-0',
                  )}
                >
                  {replyToSnippet && bodyIsOnlyImageUrl ? (
                    <div className="px-3.5 pt-2.5">{replyToSnippet}</div>
                  ) : null}
                  {replyToSnippet && !bodyIsOnlyImageUrl ? replyToSnippet : null}
                  {bodyIsOnlyImageUrl ? null : (
                    <p className="whitespace-pre-wrap break-words text-base leading-relaxed first:mt-0">{msg.body}</p>
                  )}
                  <div className={cn('min-w-0', bodyIsOnlyImageUrl && 'p-0', '[&>a]:mt-0')}>
                    <MessageAttachment msg={msg} />
                  </div>
                  <div
                    className={cn(
                      'flex flex-wrap items-center justify-end gap-x-1.5 gap-y-0 text-sm text-muted-foreground',
                      bodyIsOnlyImageUrl ? 'px-3 pb-2.5 pt-1.5' : 'mt-1.5',
                    )}
                  >
                    <time dateTime={msg.created_at} title={new Date(msg.created_at).toLocaleString('es')}>
                      {formatMessageTime(msg.created_at)}
                    </time>
                    {msg.edited_at ? <span className="opacity-80">(editado)</span> : null}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex w-full min-w-0 max-w-full items-end gap-3">
            <div
              className={cn(
                'flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold',
                'bg-primary/12 text-primary',
              )}
              aria-hidden
            >
              {authorInitials(msg)}
            </div>
            <div className="min-w-0 flex-1">
              <header className="mb-1 flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 pl-0.5">
                <button
                  type="button"
                  className="text-foreground text-base font-semibold tracking-tight hover:underline"
                  onClick={() => onAuthorClick?.(msg.author_id)}
                >
                  {authorName(msg)}
                </button>
                <time
                  className="text-muted-foreground text-sm"
                  dateTime={msg.created_at}
                  title={new Date(msg.created_at).toLocaleString('es')}
                >
                  {formatMessageTime(msg.created_at)}
                </time>
                {msg.edited_at ? <span className="text-sm text-muted-foreground/90">(editado)</span> : null}
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
                    <X className="size-4" />
                  </button>
                </div>
              ) : (
                <div
                  className={cn(
                    'max-w-full border border-border/60 bg-muted/90 text-foreground shadow-sm',
                    'rounded-2xl rounded-tl-md',
                    bodyIsOnlyImageUrl && !replyToSnippet
                      ? 'overflow-hidden p-0'
                      : 'px-3.5 py-2.5',
                  )}
                >
                  {replyToSnippet && bodyIsOnlyImageUrl ? (
                    <div className="px-3.5 pt-2.5">{replyToSnippet}</div>
                  ) : (
                    replyToSnippet
                  )}
                  {bodyIsOnlyImageUrl ? null : (
                    <p className="whitespace-pre-wrap break-words text-base leading-relaxed">{msg.body}</p>
                  )}
                  <div className="min-w-0 [&>a]:mt-0">
                    <MessageAttachment msg={msg} />
                  </div>
                </div>
              )}
            </div>
          </div>
        )
      ) : (
        <div className="flex w-full min-w-0 gap-2">
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
              <button
                type="button"
                className="text-foreground text-sm font-medium hover:underline"
                onClick={() => onAuthorClick?.(msg.author_id)}
              >
                {authorName(msg)}
              </button>
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

            {editing ? (
              <div className="mt-1 flex items-center gap-2">
                <input
                  ref={editInputRef}
                  type="text"
                  className="bg-muted border-border flex-1 rounded-md border px-2 py-1 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring"
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
                  <X className="size-4" />
                </button>
              </div>
            ) : (
              <>
                {bodyIsOnlyImageUrl ? null : (
                  <p className="text-foreground mt-0.5 whitespace-pre-wrap break-words text-sm">{msg.body}</p>
                )}
                <MessageAttachment msg={msg} />
              </>
            )}

            {grouped.length > 0 && !editing && supportsReactions ? (
              <div className="mt-1 flex flex-wrap gap-1">
                {grouped.map((g) => (
                  <button
                    key={g.emoji}
                    type="button"
                    onClick={() => void handleReaction(g.emoji)}
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors',
                      g.hasOwn
                        ? 'border-primary/40 bg-primary/10 text-foreground'
                        : 'border-border bg-muted/50 text-muted-foreground hover:bg-muted',
                    )}
                  >
                    <span>{g.emoji}</span>
                    <span>{g.count}</span>
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setEmojiPickerOpen((p) => !p)}
                  className="inline-flex items-center rounded-full border border-border bg-muted/50 px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-muted"
                  title="Reaccionar"
                >
                  <Smile className="size-3.5" />
                </button>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {hovered && !editing ? (
        <div
          className={cn(
            'absolute -top-3 z-10 flex items-center gap-0.5 rounded-md border border-border bg-background px-1 py-0.5 shadow-md',
            isDm && isOwn ? 'left-2 right-auto' : 'right-2',
          )}
        >
          {supportsReactions ? (
            <button
              type="button"
              onClick={() => setEmojiPickerOpen((p) => !p)}
              className="inline-flex size-7 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
              title="Reaccionar"
            >
              <Smile className="size-4" />
            </button>
          ) : null}
          {onReply ? (
            <button
              type="button"
              onClick={() => onReply(msg)}
              className="inline-flex size-7 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
              title="Responder"
            >
              <Reply className="size-4" />
            </button>
          ) : null}
          {isOwn ? (
            <>
              <button
                type="button"
                onClick={startEdit}
                className="inline-flex size-7 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                title="Editar"
              >
                <Pencil className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="inline-flex size-7 items-center justify-center rounded text-destructive/70 hover:bg-destructive/10 hover:text-destructive"
                title="Borrar"
              >
                <Trash2 className="size-4" />
              </button>
            </>
          ) : null}
        </div>
      ) : null}

      {emojiPickerOpen && supportsReactions ? (
        <div
          className={cn(
            'absolute -top-10 z-20 flex items-center gap-0.5 rounded-lg border border-border bg-background px-1.5 py-1 shadow-lg',
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
            'absolute -top-3 z-20 flex items-center gap-1.5 rounded-md border border-destructive/30 bg-background px-2 py-1 shadow-lg',
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
