import type { Session } from '@supabase/supabase-js'
import { getSupabaseBrowserClient } from '@/lib/supabase'

let subscription: { unsubscribe: () => void } | null = null

/**
 * Tras `createSupabaseBrowserClient()` y **después** de `ensureSupabaseSession` (p. ej. su
 * `getSession`), de modo que `onAuthStateChange` no compita con el arranque de sesión
 * (mutex `lock:sb-…-auth-token` de gotrue). No usar un `useEffect` paralelo.
 */
export function registerSupabaseAuthListenerOnce(
  onSession: (session: Session | null) => void,
): void {
  if (subscription) return
  const sb = getSupabaseBrowserClient()
  const { data } = sb.auth.onAuthStateChange((_event, session) => {
    onSession(session)
  })
  subscription = data.subscription
}
