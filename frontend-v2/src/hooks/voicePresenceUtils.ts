import type {
  VoiceOccupantsByChannel,
  VoiceParticipantsSnapshot,
  VoicePresenceRow,
} from '@/types/models'

export function presenceRowsToByChannel(
  state: Record<string, VoicePresenceRow[]>,
): VoiceOccupantsByChannel {
  const byChannel: VoiceOccupantsByChannel = {}
  for (const [presenceKey, rows] of Object.entries(state)) {
    if (!Array.isArray(rows) || rows.length === 0) continue
    // Supabase Presence puede conservar múltiples metas por clave; usamos
    // la última para reflejar inmediatamente el último track() del usuario.
    const row = rows[rows.length - 1]
    const vid = row.voiceChannelId
    if (vid == null || vid === '') continue
    const userId =
      typeof row.user_id === 'string' && row.user_id.length > 0 ? row.user_id : presenceKey
    const username =
      typeof row.username === 'string' && row.username.trim().length > 0
        ? row.username.trim()
        : userId.slice(0, 8)
    const isMuted = row.muted === true
    if (!byChannel[vid]) byChannel[vid] = []
    byChannel[vid].push({ userId, username, isMuted })
  }
  for (const id of Object.keys(byChannel)) {
    const list = byChannel[id]
    const seen = new Set<string>()
    byChannel[id] = list.filter((u) => {
      if (seen.has(u.userId)) return false
      seen.add(u.userId)
      return true
    })
    byChannel[id].sort((a, b) => a.username.localeCompare(b.username, 'es'))
  }
  return byChannel
}

export function normalizeSnapshot(byChannelRaw: VoiceParticipantsSnapshot['byChannel']): VoiceOccupantsByChannel {
  const out: VoiceOccupantsByChannel = {}
  if (!byChannelRaw || typeof byChannelRaw !== 'object') return out
  for (const [channelId, rows] of Object.entries(byChannelRaw)) {
    if (!Array.isArray(rows)) continue
    const mapped = rows
      .map((row) => {
        const userId = String(row?.identity || '').trim()
        if (!userId) return null
        const username = String(row?.name || row?.identity || '').trim() || userId.slice(0, 8)
        return { userId, username, isMuted: false }
      })
      .filter((v): v is { userId: string; username: string; isMuted: boolean } => v != null)
    if (mapped.length > 0) out[channelId] = mapped
  }
  return out
}

export function mergeOccupants(
  presenceMap: VoiceOccupantsByChannel,
  snapshotMap: VoiceOccupantsByChannel,
): VoiceOccupantsByChannel {
  const out: VoiceOccupantsByChannel = {}
  const assignmentByUser = new Map<
    string,
    { channelId: string; username: string; isMuted?: boolean; priority: 1 | 2 }
  >()

  const assign = (map: VoiceOccupantsByChannel, priority: 1 | 2) => {
    for (const [channelId, users] of Object.entries(map || {})) {
      if (!Array.isArray(users)) continue
      for (const u of users) {
        if (!u?.userId) continue
        const existing = assignmentByUser.get(u.userId)
        if (!existing || priority >= existing.priority) {
          assignmentByUser.set(u.userId, {
            channelId,
            username: u.username,
            isMuted: u.isMuted,
            priority,
          })
        }
      }
    }
  }

  // Snapshot sirve como base; Presence manda para resolver canal actual.
  assign(snapshotMap, 1)
  assign(presenceMap, 2)

  for (const [userId, assignment] of assignmentByUser.entries()) {
    if (!out[assignment.channelId]) out[assignment.channelId] = []
    out[assignment.channelId].push({
      userId,
      username: assignment.username,
      isMuted: assignment.isMuted,
    })
  }

  for (const id of Object.keys(out)) {
    out[id].sort((a, b) => a.username.localeCompare(b.username, 'es'))
  }

  return out
}
