/**
 * Compositor de chat (canal y DM): geometría compartida para no “bailar” al cambiar de vista.
 * Caja principal: rectángulo redondeado (~12px), más oscura que el área de mensajes, borde 1px y aire interno generoso.
 */

export const CHAT_COMPOSER_DOCK =
  'lux-glass-composer box-border relative z-10 flex min-h-[4.5rem] shrink-0 items-center gap-2.5 px-3 py-2.5 sm:px-4'

export const USER_ACCOUNT_FOOTER_DOCK =
  'box-border h-[60px] shrink-0 border-t border-white/[0.05] bg-foreground/[0.03] [box-shadow:inset_0_1px_0_0_rgba(255,255,255,0.03)]'

export const CHAT_COMPOSER_SHELL =
  'border-border/50 flex min-h-[2.875rem] min-w-0 flex-1 items-center gap-2 rounded-[12px] border border-white/[0.1] ' +
  'bg-foreground/[0.11] px-4 py-3 ' +
  'shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)] backdrop-blur-md transition-[border-color,background-color,box-shadow] duration-300 ' +
  'ease-[cubic-bezier(0.32,0.72,0,1)] focus-within:border-white/[0.14] focus-within:bg-foreground/[0.14] ' +
  'focus-within:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08),0_0_0_1px_oklch(0.55_0.1_280/0.18)]'

export const CHAT_COMPOSER_INPUT =
  'h-auto min-h-0 w-full min-w-0 border-0 bg-transparent py-0 pl-0.5 pr-1 text-sm leading-[1.55] text-foreground/95 shadow-none ' +
  'file:inline-flex file:h-6 file:border-0 file:bg-transparent ' +
  'file:text-sm file:font-medium file:text-foreground ' +
  'placeholder:text-muted-foreground/80 placeholder:tracking-tight ' +
  'focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:outline-none ' +
  'disabled:pointer-events-none disabled:cursor-not-allowed ' +
  'dark:bg-transparent'

export const CHAT_COMPOSER_SEND_BUTTON =
  'size-9 shrink-0 rounded-[10px] shadow-[inset_0_1px_0_0_oklch(1_0_0/0.12)] transition-[transform,box-shadow,filter] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:brightness-105 active:scale-[0.96]'
