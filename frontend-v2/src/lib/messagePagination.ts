import type { ChannelMessage } from '@/types/models'

/** Mensaje más antiguo persistido (excluye filas optimistas `__local__…`) para cursor `before=`. */
export function oldestPersistedMessage(messages: ChannelMessage[]): ChannelMessage | null {
  const real = messages.find((m) => !m.id.startsWith('__local__'))
  return real ?? messages[0] ?? null
}
