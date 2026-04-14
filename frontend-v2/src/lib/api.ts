import type { BootstrapPayload } from '@/types/models'

function resolveApiOrigin(): string {
  if (typeof window === 'undefined') return ''
  const w = window as Window & { __API_ORIGIN__?: string }
  const raw = w.__API_ORIGIN__
  if (raw != null && String(raw).trim()) return String(raw).replace(/\/$/, '')
  return ''
}

/** Ruta API relativa al origen de la página o `__API_ORIGIN__`. */
export function resolveApiUrl(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`
  const base = resolveApiOrigin()
  return base ? `${base}${p}` : p
}

export async function fetchUsernameAvailable(username: string): Promise<{
  ok: boolean
  available: boolean
  error: string | null
}> {
  const u = username.trim()
  if (u.length < 2) {
    return { ok: false, available: false, error: 'El nombre debe tener al menos 2 caracteres válidos.' }
  }
  const res = await fetch(
    resolveApiUrl(`/api/auth/username-available?username=${encodeURIComponent(u)}`),
  )
  const data = (await res.json().catch(() => ({}))) as { error?: string; available?: boolean }
  if (!res.ok) {
    return { ok: false, available: false, error: data.error || 'No se pudo comprobar el nombre.' }
  }
  return { ok: true, available: Boolean(data.available), error: null }
}

export async function apiGetJson<T>(
  path: string,
  accessToken: string | null,
): Promise<T> {
  const headers: HeadersInit = { 'Content-Type': 'application/json' }
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`
  const res = await fetch(resolveApiUrl(path), { headers })
  const payload = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) {
    throw new Error(
      typeof payload === 'object' && payload && 'error' in payload && payload.error
        ? String(payload.error)
        : 'Error en la API',
    )
  }
  return payload as T
}

export async function fetchBootstrap(
  accessToken: string,
  username: string,
): Promise<BootstrapPayload> {
  const q = encodeURIComponent(username)
  return apiGetJson<BootstrapPayload>(`/api/bootstrap?username=${q}`, accessToken)
}

export async function apiPostJson<T>(
  path: string,
  accessToken: string | null,
  body: unknown,
): Promise<T> {
  const headers: HeadersInit = { 'Content-Type': 'application/json' }
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`
  const res = await fetch(resolveApiUrl(path), {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
  const payload = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) {
    throw new Error(
      typeof payload === 'object' && payload && 'error' in payload && payload.error
        ? String(payload.error)
        : 'Error en la API',
    )
  }
  return payload as T
}
