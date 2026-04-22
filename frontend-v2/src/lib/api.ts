import type { BootstrapPayload } from '@/types/models'
import { getApiBaseUrl, PRODUCTION_API_ORIGIN, resolveApiOrigin } from '@/lib/apiOrigin'

export { getApiBaseUrl, PRODUCTION_API_ORIGIN, resolveApiOrigin }

/** Base resuelta al cargar el módulo; coincide con `getApiBaseUrl()`. */
export const API_BASE_URL = getApiBaseUrl()

/**
 * URL absoluta `API + path` o path relativo `/api/...` si en dev el base es `''` (proxy Vite).
 */
export function resolveApiUrl(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`
  const base = getApiBaseUrl()
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

async function apiFetch<T>(
  method: string,
  path: string,
  accessToken: string | null,
  body?: unknown,
): Promise<T> {
  const headers: HeadersInit = { 'Content-Type': 'application/json' }
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`
  const init: RequestInit = { method, headers }
  if (body !== undefined) init.body = JSON.stringify(body)
  const res = await fetch(resolveApiUrl(path), init)
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

export async function apiPostJson<T>(
  path: string,
  accessToken: string | null,
  body: unknown,
): Promise<T> {
  return apiFetch<T>('POST', path, accessToken, body)
}

export async function apiPatchJson<T>(
  path: string,
  accessToken: string | null,
  body: unknown,
): Promise<T> {
  return apiFetch<T>('PATCH', path, accessToken, body)
}

export async function apiDeleteJson<T>(
  path: string,
  accessToken: string | null,
): Promise<T> {
  return apiFetch<T>('DELETE', path, accessToken)
}
