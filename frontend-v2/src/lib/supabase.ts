import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let browserClient: SupabaseClient | null = null
let realtimeAuthToken: string | null = null
let realtimeAuthInFlight: Promise<void> | null = null

function resolveApiOrigin(): string {
  if (typeof window === 'undefined') return ''
  const w = window as Window & { __API_ORIGIN__?: string }
  const raw = w.__API_ORIGIN__
  if (raw != null && String(raw).trim()) return String(raw).replace(/\/$/, '')
  return ''
}

/**
 * Crea el cliente Supabase del navegador (singleton) para auth y Realtime en la app React.
 * Credenciales: 1) `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`; 2) si faltan, `GET /api/config` (mismo origen o `__API_ORIGIN__`).
 */
export async function createSupabaseBrowserClient(): Promise<SupabaseClient> {
  if (browserClient) return browserClient

  const envUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
  const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
  if (envUrl?.trim() && envKey?.trim()) {
    browserClient = createClient(envUrl.trim(), envKey.trim())
    return browserClient
  }

  const base = resolveApiOrigin()
  const res = await fetch(`${base}/api/config`)
  const cfg = (await res.json()) as {
    supabaseUrl?: string
    supabaseAnonKey?: string
  }
  if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) {
    throw new Error('Config Supabase no disponible (VITE_* o /api/config).')
  }
  browserClient = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey)
  return browserClient
}

/** Solo tras `createSupabaseBrowserClient()` resuelta. */
export function getSupabaseBrowserClient(): SupabaseClient {
  if (!browserClient) {
    throw new Error('Supabase no inicializado: llama primero a createSupabaseBrowserClient().')
  }
  return browserClient
}

/**
 * Devuelve cliente Supabase con Realtime autenticado de forma centralizada.
 * Evita llamar `setAuth` repetidamente si el token no cambió.
 */
export async function getAuthenticatedSupabase(accessToken: string): Promise<SupabaseClient> {
  const token = String(accessToken || '').trim()
  if (!token) {
    throw new Error('Access token requerido para autenticar Realtime.')
  }

  const client = await createSupabaseBrowserClient()
  if (realtimeAuthToken === token) return client

  if (realtimeAuthInFlight) {
    await realtimeAuthInFlight
    if (realtimeAuthToken === token) return client
  }

  realtimeAuthInFlight = (async () => {
    await client.realtime.setAuth(token)
    realtimeAuthToken = token
  })().finally(() => {
    realtimeAuthInFlight = null
  })

  await realtimeAuthInFlight
  return client
}

/** Para tests o cambio de sesión explícito. */
export function resetSupabaseBrowserClient(): void {
  browserClient = null
  realtimeAuthToken = null
  realtimeAuthInFlight = null
}
