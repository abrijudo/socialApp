import { useEffect, useRef } from 'react'
import { requestNotificationPermission } from '@/lib/desktopNotifications'
import { useAppStore } from '@/store/useAppStore'

/**
 * Pide permiso de notificaciones del sistema tras sesión válida (Electron / web).
 * No bloquea el hilo; falla en silencio si el usuario deniega.
 */
export function NotificationPermissionBootstrap() {
  const initialBootDone = useAppStore((s) => s.initialBootDone)
  const accessToken = useAppStore((s) => s.accessToken)
  const asked = useRef(false)

  useEffect(() => {
    if (!initialBootDone || !accessToken || asked.current) return
    asked.current = true
    void requestNotificationPermission().catch(() => {})
  }, [initialBootDone, accessToken])

  return null
}
