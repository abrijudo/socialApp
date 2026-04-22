/**
 * Comparación de lectura vs último mensaje para badges (Fase 5).
 * `lastReadIso` ausente se trata como epoch 0 (todo lo anterior a la primera visita no cuenta como “visto” salvo que haya timestamp persistido).
 */
export function isMessageNewerThanRead(messageIso: string, lastReadIso: string | undefined): boolean {
  const tM = Date.parse(messageIso)
  if (!Number.isFinite(tM)) return false
  const tR = lastReadIso != null && lastReadIso !== '' ? Date.parse(lastReadIso) : 0
  if (!Number.isFinite(tR)) return tM > 0
  return tM > tR
}

/** Documento en segundo plano o pestaña oculta (mensajes en el hilo activo igual cuentan como no leídos para badge). */
export function isDocumentHiddenOrUnfocused(): boolean {
  if (typeof document === 'undefined') return false
  if (document.visibilityState === 'hidden') return true
  return !document.hasFocus()
}
