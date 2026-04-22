/**
 * Origen del backend Express (`/api/...`).
 * - Web con Vite: rutas relativas al mismo host (proxy `/api` en dev).
 * - Electron empaquetado (`file://`): obligatorio `VITE_API_ORIGIN` en el build o `window.__API_ORIGIN__`.
 */
export function resolveApiOrigin(): string {
  if (typeof window !== 'undefined') {
    const w = window as Window & { __API_ORIGIN__?: string }
    const raw = w.__API_ORIGIN__
    if (raw != null && String(raw).trim()) return String(raw).replace(/\/$/, '')
  }
  const env = import.meta.env.VITE_API_ORIGIN as string | undefined
  if (env != null && String(env).trim()) return String(env).trim().replace(/\/$/, '')
  return ''
}
