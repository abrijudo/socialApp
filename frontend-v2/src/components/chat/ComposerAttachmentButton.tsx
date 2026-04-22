import { useId, useRef, type ChangeEvent } from 'react'
import { Paperclip } from 'lucide-react'
import { cn } from '@/lib/utils'
import { LUX_ICON_STROKE, luxIconMessage } from '@/lib/luxIcon'
import { COMPOSER_ATTACHMENT_ACCEPT } from '@/lib/attachmentConstants'

type ComposerAttachmentButtonProps = {
  onFileSelected: (file: File) => void
  /** Subida en curso: el input no acepta otra selección. */
  disabled?: boolean
  className?: string
}

/**
 * Abre un selector de archivos; la validación (tamaño, tipo) hace el padre.
 */
export function ComposerAttachmentButton({ onFileSelected, disabled, className }: ComposerAttachmentButtonProps) {
  const id = useId()
  const inputRef = useRef<HTMLInputElement>(null)

  function onChange(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (f) onFileSelected(f)
  }

  return (
    <>
      <input
        ref={inputRef}
        id={id}
        type="file"
        className="hidden"
        accept={COMPOSER_ATTACHMENT_ACCEPT}
        tabIndex={-1}
        disabled={Boolean(disabled)}
        onChange={onChange}
        aria-hidden
      />
      <button
        type="button"
        className={cn(
          'text-muted-foreground hover:text-foreground hover:bg-muted/50 -ml-0.5 shrink-0 rounded-lg p-1.5 transition-[color,background-color]',
          disabled && 'pointer-events-none opacity-40',
          className,
        )}
        title="Adjuntar imagen o PDF"
        onClick={() => {
          if (!disabled) inputRef.current?.click()
        }}
        aria-label="Adjuntar archivo"
      >
        <Paperclip className={cn(luxIconMessage, 'size-4')} strokeWidth={LUX_ICON_STROKE} />
      </button>
    </>
  )
}
