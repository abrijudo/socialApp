import { createSupabaseBrowserClient, getSupabaseBrowserClient } from '@/lib/supabase'
import { useAppStore } from '@/store/useAppStore'

/**
 * Registra `onAuthStateChange` una vez (tras crear el singleton) para:
 * - sincronizar el store con `TOKEN_REFRESHED` / `SIGNED_IN` (JWT usado por la API REST);
 * - actualizar Realtime vía `getAuthenticatedSupabase` con el token vigente;
 * - al cerrar sesión, alinear estado y limpiar el JWT de Realtime.
 *
 * Devuelve una función para desuscribirse (desmontaje de la app / tests).
 */
export function startSupabaseAuthListener(): () => void {
  let subscription: { unsubscribe: () => void } | undefined

  const ready = (async () => {
    await createSupabaseBrowserClient()
    const sb = getSupabaseBrowserClient()
    const { data } = sb.auth.onAuthStateChange((_event, session) => {
      useAppStore.getState().syncWithSupabaseSession(session)
    })
    subscription = data.subscription
  })()

  return () => {
    void ready.then(() => {
      subscription?.unsubscribe()
    })
  }
}
