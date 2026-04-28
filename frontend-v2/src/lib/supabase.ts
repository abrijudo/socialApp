import { createClient, type SupabaseClient, type SupabaseClientOptions } from '@supabase/supabase-js'
import { getApiBaseUrl } from '@/lib/apiOrigin'
import { isElectronAppShell } from '@/lib/electron'

const CONFIG_FETCH_TIMEOUT_MS = 20_000

let browserClient: SupabaseClient | null = null
/** Evita múltiples `createClient` en paralelo (p. ej. `initializeSession` + auth listener, StrictMode). */
let createClientInFlight: Promise<SupabaseClient> | null = null
let realtimeAuthToken: string | null = null
let realtimeAuthInFlight: Promise<void> | null = null

/** Opciones de auth del navegador: persistencia, refresh proactivo y flujo web seguro. */
function getBrowserAuthOptions(): SupabaseClientOptions<'public'> {
  const storage =
    typeof globalThis !== 'undefined' && 'localStorage' in globalThis
      ? (globalThis as unknown as { localStorage: Storage }).localStorage
      : undefined
  /** En `file://` / `app://` (Electron empaquetado) no hay URL de retorno fiable como en el navegador. */
  const isFile =
    typeof window !== 'undefined' &&
    (window.location?.protocol === 'file:' ||
      (isElectronAppShell() && window.location?.protocol === 'app:'))
  const detectSessionInUrl = !isFile && !isElectronAppShell()
  return {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl,
      flowType: 'pkce',
      ...(storage ? { storage } : {}),
    },
  }
}

/**
 * Crea el cliente Supabase del navegador (singleton) para auth y Realtime en la app React.
 * Credenciales: 1) `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`; 2) si faltan, `GET /api/config` (mismo origen o `__API_ORIGIN__`).
 */
export async function createSupabaseBrowserClient(): Promise<SupabaseClient> {
  if (browserClient) return browserClient
  if (createClientInFlight) return createClientInFlight

  createClientInFlight = (async (): Promise<SupabaseClient> => {
    const options = getBrowserAuthOptions()
    const envUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
    const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
    if (envUrl?.trim() && envKey?.trim()) {
      browserClient = createClient(envUrl.trim(), envKey.trim(), options)
      return browserClient
    }

    const base = getApiBaseUrl()
    const ac = new AbortController()
    const t = setTimeout(() => ac.abort(), CONFIG_FETCH_TIMEOUT_MS)
    let res: Response
    try {
      res = await fetch(`${base}/api/config`, { signal: ac.signal })
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') {
        throw new Error(
          `Timeout (${CONFIG_FETCH_TIMEOUT_MS / 1000}s) al cargar /api/config desde ${base || '(origen vacío)'}: comprueba VITE_API_ORIGIN o la red (Electron empaquetado).`,
        )
      }
      throw e
    } finally {
      clearTimeout(t)
    }
    if (!res.ok) {
      throw new Error(
        `No se pudo cargar /api/config (HTTP ${res.status}). Verifica que el backend esté activo.`,
      )
    }

    const raw = await res.text()
    let cfg: {
      supabaseUrl?: string
      supabaseAnonKey?: string
    }
    try {
      cfg = (raw ? JSON.parse(raw) : {}) as {
        supabaseUrl?: string
        supabaseAnonKey?: string
      }
    } catch {
      throw new Error('Respuesta inválida en /api/config (JSON malformado o vacío).')
    }

    if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) {
      throw new Error('Config Supabase no disponible (VITE_* o /api/config).')
    }
    browserClient = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, options)
    return browserClient
  })()

  try {
    return await createClientInFlight
  } finally {
    createClientInFlight = null
  }
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

/**
 * Tras cierre de sesión o `signOut`, limpia el JWT en Realtime para que canales posteriores
 * no sigan con la identidad anterior. Idempotente.
 */
export async function clearAuthenticatedRealtimeAuth(): Promise<void> {
  realtimeAuthToken = null
  if (!browserClient) return
  try {
    await browserClient.realtime.setAuth(null)
  } catch {
    /* noop */
  }
}

/** Para tests o cambio de sesión explícito. */
export function resetSupabaseBrowserClient(): void {
  browserClient = null
  createClientInFlight = null
  realtimeAuthToken = null
  realtimeAuthInFlight = null
}
