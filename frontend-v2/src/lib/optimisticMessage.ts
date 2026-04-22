import type { ChannelMessage, Profile } from '@/types/models'

const PREFIX = '__local__' as const

export function isOptimisticMessageId(id: string): boolean {
  return id.startsWith(PREFIX)
}

export type OptimisticMedia = {
  messageType: 'image' | 'file' | 'text'
  mediaData: string
  mediaMime: string
  mediaName: string | null
}

/**
 * Fila de mensaje mostrada al instante al enviar; se sustituye al llegar
 * el id del servidor o el INSERT de Realtime (deduplicación en el store).
 */
export function makeOptimisticChannelMessage(
  parentColumnId: string,
  userId: string,
  body: string,
  profile: Profile | null,
  parentMessageId: string | null,
  media?: OptimisticMedia | null,
): ChannelMessage {
  return {
    id: `${PREFIX}${crypto.randomUUID()}`,
    channel_id: parentColumnId,
    author_id: userId,
    body,
    created_at: new Date().toISOString(),
    edited_at: null,
    message_type: media?.messageType ?? 'text',
    media_data: media?.mediaData,
    media_mime: media?.mediaMime,
    media_name: media?.mediaName,
    parent_message_id: parentMessageId,
    profiles: profile,
    reactions: [],
    replyCount: 0,
    localStatus: 'sending',
  }
}
