import { useAppStore } from '@/store/useAppStore'
import { cn } from '@/lib/utils'

const EMPTY: string[] = []

export interface TypingIndicatorProps {
  /** `channel_id` de texto o `dm_channel_id`. */
  channelId: string | null
  className?: string
}

/**
 * Lee `typingUsernamesByChannel` del store (poblado por `useTypingIndicator`).
 */
export function TypingIndicator({ channelId, className }: TypingIndicatorProps) {
  const names = useAppStore((s) =>
    channelId ? (s.typingUsernamesByChannel[channelId] ?? EMPTY) : EMPTY,
  )

  if (!channelId || names.length === 0) return null

  let line: string
  if (names.length === 1) {
    line = `${names[0]} está escribiendo`
  } else if (names.length === 2) {
    line = `${names[0]} y ${names[1]} están escribiendo`
  } else {
    line = 'Varias personas están escribiendo'
  }

  return (
    <div
      className={cn('shrink-0 px-3 pt-1.5 pb-0', className)}
      role="status"
      aria-live="polite"
      aria-relevant="additions text"
    >
      <p className="text-muted-foreground flex flex-wrap items-baseline gap-x-0 text-xs">
        <span className="min-w-0 truncate">{line}</span>
        <span className="text-muted-foreground/90 sc-typing-dots" aria-hidden>
          <span />
          <span />
          <span />
        </span>
      </p>
    </div>
  )
}
