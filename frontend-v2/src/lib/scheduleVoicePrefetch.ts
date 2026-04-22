const PREFETCH_DELAY_MS = 2_500

/**
 * Tras unos segundos, carga módulos LiveKit que no usamos en el arranque (p. ej. prefabs)
 * para aliviar el hit al conectar, sin competir con la primera pintura.
 * @returns limpiador (cancela el timeout) para usar en el cleanup de un `useEffect`
 */
export function scheduleVoiceModulePrefetch(): () => void {
  if (typeof window === 'undefined') {
    return () => {}
  }
  const id = window.setTimeout(() => {
    void import('@livekit/components-react/prefabs').catch(() => {
      /* best-effort */
    })
  }, PREFETCH_DELAY_MS)
  return () => {
    clearTimeout(id)
  }
}
