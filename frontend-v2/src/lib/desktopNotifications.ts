import type { ChannelMessage } from '@/types/models'

const BODY_MAX = 180

export type GuildChannelNotificationPayload = {
  kind: 'guild'
  serverName: string
  channelName: string
  message: ChannelMessage
}

export type DmNotificationPayload = {
  kind: 'dm'
  peerDisplayName: string
  message: ChannelMessage
}

export type MessageNotificationPayload = GuildChannelNotificationPayload | DmNotificationPayload

function truncateBody(text: string, max = BODY_MAX): string {
  const t = text.replace(/\s+/g, ' ').trim()
  if (t.length <= max) return t
  return `${t.slice(0, max - 1)}…`
}

export function canUseDesktopNotifications(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window
}

/** Solicita permiso una vez; idempotente si ya está concedido o denegado. */
export function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!canUseDesktopNotifications()) {
    return Promise.resolve('denied' as NotificationPermission)
  }
  const n = Notification
  if (n.permission === 'granted' || n.permission === 'denied') {
    return Promise.resolve(n.permission)
  }
  return n.requestPermission()
}

/**
 * Muestra notificación nativa (Electron / navegador). Devuelve false si no se pudo (sin permiso o error).
 */
export function showDesktopNotification(payload: MessageNotificationPayload): boolean {
  if (!canUseDesktopNotifications() || Notification.permission !== 'granted') {
    return false
  }
  const msg = payload.message
  const body = truncateBody(msg.body)
  let title: string
  let tag: string
  if (payload.kind === 'guild') {
    const sn = payload.serverName.trim() || 'Servidor'
    const cn = payload.channelName.trim() || 'canal'
    title = `${sn} · #${cn}`
    tag = `ch:${msg.channel_id}:${msg.id}`
  } else {
    title = payload.peerDisplayName.trim() || 'Mensaje directo'
    tag = `dm:${msg.channel_id}:${msg.id}`
  }
  try {
    new Notification(title, { body, tag })
    return true
  } catch {
    return false
  }
}
