/** Normaliza nombres de usuario para registro y metadatos de Supabase (mismo criterio que la API). */
export function normalizeUsername(raw = ''): string {
  const cleaned = String(raw)
    .trim()
    .replace(/\s+/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '')
  if (cleaned.length >= 2) return cleaned.slice(0, 20)
  return `user${crypto.randomUUID().slice(0, 6)}`
}
