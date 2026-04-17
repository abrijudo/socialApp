/** Fechas amigables en español (ej. "Hoy a las 14:30").
 *
 * La función se llama en cada render de cada `MessageItem`, así que mantenemos:
 *  - Los formatters `Intl.DateTimeFormat` creados UNA sola vez (construirlos
 *    es sorprendentemente caro: ~1-2ms por instancia).
 *  - Un cache por ISO+día actual. La clave incluye el día para que, al cruzar
 *    medianoche, los mensajes recalculen su etiqueta relativa ("Hoy"/"Ayer").
 *    El tamaño del cache se limita a 2000 entradas para evitar crecimiento
 *    ilimitado en sesiones muy largas.
 */

const timeFmt = new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit' })
const dateFmt = new Intl.DateTimeFormat('es', { weekday: 'short', day: 'numeric', month: 'short' })

const MAX_CACHE = 2000
const cache = new Map<string, string>()

function currentDayKey(now: Date): string {
  return `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`
}

function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getDate() === b.getDate() &&
    a.getMonth() === b.getMonth() &&
    a.getFullYear() === b.getFullYear()
  )
}

export function formatMessageTime(iso: string): string {
  const now = new Date()
  const key = `${iso}|${currentDayKey(now)}`

  const cached = cache.get(key)
  if (cached !== undefined) return cached

  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''

  const timeStr = timeFmt.format(d)

  let result: string
  if (isSameLocalDay(d, now)) {
    result = `Hoy a las ${timeStr}`
  } else {
    const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
    if (isSameLocalDay(d, yesterday)) {
      result = `Ayer a las ${timeStr}`
    } else {
      result = `${dateFmt.format(d)} · ${timeStr}`
    }
  }

  if (cache.size >= MAX_CACHE) {
    // Estrategia simple: vaciar al llegar al tope. En la práctica no se llega
    // con 50 mensajes visibles + algunos cambios de canal.
    cache.clear()
  }
  cache.set(key, result)
  return result
}
