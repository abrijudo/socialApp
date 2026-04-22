import type { Session, SupabaseClient, User } from '@supabase/supabase-js'
import { SOCIALAPP_USER_KEY } from '@/lib/constants'
import { fetchUsernameAvailable } from '@/lib/api'
import { normalizeUsername } from '@/lib/username'

/** Migra la clave antigua `session-display-name` al formato actual (`SOCIALAPP_USER_KEY`). */
function migrateLegacyDisplayNameKey(): void {
  if (typeof localStorage === 'undefined') return
  if (localStorage.getItem(SOCIALAPP_USER_KEY)) return
  const legacy = localStorage.getItem('session-display-name')?.trim()
  if (!legacy) return
  const u = normalizeUsername(legacy)
  if (u) localStorage.setItem(SOCIALAPP_USER_KEY, JSON.stringify({ id: null, username: u }))
  localStorage.removeItem('session-display-name')
}

function parseSocialappUserRaw(): { id: string | null; username: string } | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(SOCIALAPP_USER_KEY)
    if (!raw) return null
    const o = JSON.parse(raw) as { id?: unknown; username?: unknown }
    if (!o || typeof o !== 'object') return null
    const id = typeof o.id === 'string' ? o.id : null
    const username = typeof o.username === 'string' ? o.username.trim() : ''
    if (!username) return null
    return { id, username }
  } catch {
    return null
  }
}

function persistSocialappUser(userId: string, username: string): void {
  if (typeof localStorage === 'undefined') return
  const n = normalizeUsername(String(username || ''))
  if (!n || !userId) return
  localStorage.setItem(SOCIALAPP_USER_KEY, JSON.stringify({ id: userId, username: n }))
}

function deriveUsername(user: User): string {
  const fromMeta =
    (user.user_metadata?.username as string | undefined) ||
    (user.user_metadata?.display_name as string | undefined) ||
    ''
  const fromEmail = user.email ? user.email.split('@')[0] : ''
  return normalizeUsername(fromMeta || fromEmail || '')
}

/** Expuesto para `onAuthStateChange` (mismo criterio que al iniciar sesión). */
export function usernameFromSupabaseUser(user: User): string {
  return deriveUsername(user)
}

async function trySignInAnonymously(
  sb: SupabaseClient,
  usernameRaw: string,
): Promise<{ session: Session; user: User; username: string } | null> {
  const username = normalizeUsername(usernameRaw)
  const { ok, available } = await fetchUsernameAvailable(username)
  if (!ok || !available) {
    localStorage.removeItem(SOCIALAPP_USER_KEY)
    return null
  }
  const { data, error } = await sb.auth.signInAnonymously({
    options: { data: { username, display_name: username } },
  })
  if (error || !data.session || !data.user) return null
  persistSocialappUser(data.user.id, username)
  return { session: data.session, user: data.user, username }
}

export type EnsureSessionResult =
  | { kind: 'ready'; session: Session; user: User; username: string }
  | { kind: 'needs_username' }

/**
 * Asegura sesión Supabase para el bootstrap de la SPA: reutiliza JWT existente, intenta auth anónima
 * con username guardado en `localStorage` (`SOCIALAPP_USER_KEY`) o con `interactiveUsername`.
 * El resultado alimenta `useAppStore.initializeSession`.
 */
export async function ensureSupabaseSession(
  sb: SupabaseClient,
  options?: { interactiveUsername?: string },
): Promise<EnsureSessionResult> {
  migrateLegacyDisplayNameKey()

  const { data, error } = await sb.auth.getSession()
  if (error) throw error

  if (data.session?.user && data.session.access_token) {
    const username = deriveUsername(data.session.user)
    persistSocialappUser(data.session.user.id, username)
    return {
      kind: 'ready',
      session: data.session,
      user: data.session.user,
      username,
    }
  }

  if (options?.interactiveUsername?.trim()) {
    const signed = await trySignInAnonymously(sb, options.interactiveUsername.trim())
    if (signed) return { kind: 'ready', ...signed }
    throw new Error('No se pudo iniciar sesión con ese nombre. Prueba con otro.')
  }

  const stored = parseSocialappUserRaw()
  if (stored?.username) {
    const signed = await trySignInAnonymously(sb, stored.username)
    if (signed) return { kind: 'ready', ...signed }
  }

  return { kind: 'needs_username' }
}
