/**
 * Clases compartidas para el compositor de chat (canal y DM) — misma “geometría”
 * y tipografía evitando saltos al cambiar de vista.
 */
/**
 * Franja fija (60px; caben `h-9` + `size-9` centrados) con borde superior alineado al pie de cuenta en la otra columna.
 * Cita/“escribiendo”/error van en un `shrink-0` encima, sin un segundo `border-t` de más.
 */
export const CHAT_COMPOSER_DOCK =
  'box-border flex h-[60px] shrink-0 items-center gap-2 border-t border-border bg-background px-3 sm:px-4'

/** Pie de cuenta: misma banda y `border-t` que `CHAT_COMPOSER_DOCK`. */
export const USER_ACCOUNT_FOOTER_DOCK = 'box-border h-[60px] shrink-0 border-t border-border'

export const CHAT_COMPOSER_SHELL =
  'border-border/50 bg-muted flex h-9 min-h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border px-3'

export const CHAT_COMPOSER_INPUT =
  'h-auto min-h-0 w-full min-w-0 border-0 bg-transparent px-0 text-sm leading-relaxed shadow-none ' +
  'file:inline-flex file:h-6 file:border-0 file:bg-transparent ' +
  'file:text-sm file:font-medium file:text-foreground ' +
  'placeholder:text-muted-foreground ' +
  'focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:outline-none ' +
  'disabled:pointer-events-none disabled:cursor-not-allowed ' +
  'dark:bg-transparent'

/** Botón de enviar alineado a la caja (no cambiar de tamaño entre vistas). */
export const CHAT_COMPOSER_SEND_BUTTON = 'size-9 shrink-0 rounded-lg'
