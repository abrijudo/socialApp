/** Límite en cliente (producción puede permitir 25MB en el servidor; aquí 5MB por UX/seguridad). */
export const MAX_COMPOSER_ATTACHMENT_BYTES = 5 * 1024 * 1024

export const COMPOSER_ATTACHMENT_ACCEPT = 'image/*,.pdf,application/pdf'

export function isAllowedComposerMime(mime: string, fileName: string): boolean {
  if (mime.startsWith('image/')) return true
  if (mime === 'application/pdf') return true
  return /\.pdf$/i.test(fileName)
}
