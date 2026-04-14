import { describe, expect, it } from 'vitest'
import {
  mergeOccupants,
  normalizeSnapshot,
  presenceRowsToByChannel,
} from '@/hooks/voicePresenceUtils'

describe('voicePresenceUtils', () => {
  it('combina presence y snapshot sin perder usuarios', () => {
    const presence = {
      chanA: [{ userId: 'u1', username: 'Ana' }],
      chanB: [{ userId: 'u2', username: 'Bruno' }],
    }
    const snapshot = {
      chanA: [{ userId: 'u3', username: 'Carlos' }],
      chanC: [{ userId: 'u4', username: 'Diana' }],
    }

    const merged = mergeOccupants(presence, snapshot)

    expect(merged.chanA).toHaveLength(2)
    expect(merged.chanA.map((u) => u.userId).sort()).toEqual(['u1', 'u3'])
    expect(merged.chanB.map((u) => u.userId)).toEqual(['u2'])
    expect(merged.chanC.map((u) => u.userId)).toEqual(['u4'])
  })

  it('normaliza snapshot de LiveKit a mapa por canal', () => {
    const normalized = normalizeSnapshot({
      chan1: [
        { identity: 'u1', name: 'Ana' },
        { identity: 'u2', name: 'Bruno' },
      ],
      chan2: [{ identity: 'u3' }],
    })

    expect(normalized.chan1).toEqual([
      { userId: 'u1', username: 'Ana' },
      { userId: 'u2', username: 'Bruno' },
    ])
    expect(normalized.chan2).toEqual([{ userId: 'u3', username: 'u3' }])
  })

  it('convierte presence state en ocupantes por canal sin duplicar', () => {
    const byChannel = presenceRowsToByChannel({
      u1: [{ user_id: 'u1', username: 'Ana', voiceChannelId: 'chan1' }],
      u2: [{ user_id: 'u2', username: 'Bruno', voiceChannelId: 'chan1' }],
      duplicated: [{ user_id: 'u2', username: 'Bruno', voiceChannelId: 'chan1' }],
    })

    expect(byChannel.chan1).toHaveLength(2)
    expect(byChannel.chan1.map((u) => u.userId).sort()).toEqual(['u1', 'u2'])
  })

  it('usa la última meta de presence al cambiar de canal', () => {
    const byChannel = presenceRowsToByChannel({
      u1: [
        { user_id: 'u1', username: 'Ana', voiceChannelId: 'chanA' },
        { user_id: 'u1', username: 'Ana', voiceChannelId: 'chanB' },
      ],
    })

    expect(byChannel.chanA).toBeUndefined()
    expect(byChannel.chanB).toEqual([{ userId: 'u1', username: 'Ana' }])
  })

  it('prioriza presence sobre snapshot y evita un usuario en dos canales', () => {
    const merged = mergeOccupants(
      {
        chanB: [{ userId: 'u1', username: 'Ana' }],
      },
      {
        chanA: [{ userId: 'u1', username: 'Ana' }],
        chanC: [{ userId: 'u2', username: 'Bruno' }],
      },
    )

    expect(merged.chanA).toBeUndefined()
    expect(merged.chanB).toEqual([{ userId: 'u1', username: 'Ana' }])
    expect(merged.chanC).toEqual([{ userId: 'u2', username: 'Bruno' }])
  })
})
