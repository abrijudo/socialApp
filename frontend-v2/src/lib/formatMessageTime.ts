/** Fechas amigables en español (ej. "Hoy a las 14:30"). */
export function formatMessageTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''

  const now = new Date()
  const isToday = d.toDateString() === now.toDateString()
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  const isYesterday = d.toDateString() === yesterday.toDateString()
  const timeStr = d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })

  if (isToday) return `Hoy a las ${timeStr}`
  if (isYesterday) return `Ayer a las ${timeStr}`
  return (
    d.toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short' }) +
    ` · ${timeStr}`
  )
}
