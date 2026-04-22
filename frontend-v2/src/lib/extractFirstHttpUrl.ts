/** Coincide con la primera URL http(s) “visible” en un mensaje (sin parsear markdown). */
const URL_IN_TEXT = /https?:\/\/[^\s<>"'()[\]{},]+/gi

function trimTrailingJunk(s: string): string {
  return s.replace(/[),.;!?»"'}\]]+$/g, '')
}

/** Devuelve el href canónico de la primera URL válida o `null`. */
export function firstHttpUrlInText(text: string): string | null {
  if (!text?.trim()) return null
  const re = new RegExp(URL_IN_TEXT.source, 'gi')
  const m = re.exec(text)
  if (!m?.[0]) return null
  const raw = trimTrailingJunk(m[0].trim())
  try {
    const u = new URL(raw)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    if (u.hostname.length === 0) return null
    return u.href
  } catch {
    return null
  }
}
