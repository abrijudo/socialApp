import { useCallback, useEffect, useRef } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { apiGetJson } from '@/lib/api'
import { getAuthenticatedSupabase, getSupabaseBrowserClient } from '@/lib/supabase'
import { useAppStore } from '@/store/useAppStore'
import type {
  VoiceOccupantsByChannel,
  VoiceParticipantsSnapshot,
  VoicePresenceRow,
} from '@/types/models'
import {
  mergeOccupants,
  normalizeSnapshot,
  presenceRowsToByChannel,
} from '@/hooks/voicePresenceUtils'
export type { VoiceChannelOccupant, VoiceOccupantsByChannel } from '@/types/models'

const VOICE_PRESENCE_TOPIC = 'global_voice_presence'

function pushVoicePresence(
  channel: { presenceState: () => unknown },
): VoiceOccupantsByChannel {
  const raw = channel.presenceState() as Record<string, VoicePresenceRow[]>
  return presenceRowsToByChannel(raw)
}

/**
 * Presencia global en canales de voz (Supabase Realtime Presence).
 *
 * - Con `subscribe: true` (solo en `AppLayout`): abre el canal, hace `track` con
 *   `{ voiceChannelId, username, user_id }` y actualiza el store.
 * - Sin `subscribe`: solo lee `voiceChannelOccupants` del store (p. ej. `ServerSidebar`).
 */
export function useVoicePresence(options?: { subscribe?: boolean }) {
  const subscribe = options?.subscribe === true
  const userId = useAppStore((s) => s.userId)
  const accessToken = useAppStore((s) => s.accessToken)
  const activeServerId = useAppStore((s) => s.activeServerId)
  const usernameFromProfile = useAppStore((s) => s.profile?.username)
  const usernameFallback = useAppStore((s) => s.username)
  const activeVoiceChannelId = useAppStore((s) => s.activeVoiceChannelId)
  const localVoiceMuted = useAppStore((s) => s.localVoiceMuted)
  const localCameraEnabled = useAppStore((s) => s.localCameraEnabled)
  const localScreenShareEnabled = useAppStore((s) => s.localScreenShareEnabled)
  const setVoiceChannelOccupants = useAppStore((s) => s.setVoiceChannelOccupants)
  const occupants = useAppStore((s) => s.voiceChannelOccupants)

  const channelRef = useRef<RealtimeChannel | null>(null)
  const subscribedRef = useRef(false)
  const presenceRef = useRef<VoiceOccupantsByChannel>({})
  const snapshotRef = useRef<VoiceOccupantsByChannel>({})
  const localSelfRef = useRef<VoiceOccupantsByChannel>({})

  function flushMerged() {
    const remoteMerged = mergeOccupants(presenceRef.current, snapshotRef.current)
    // Garantiza feedback inmediato del usuario local al entrar a voz.
    setVoiceChannelOccupants(mergeOccupants(localSelfRef.current, remoteMerged))
  }

  useEffect(() => {
    subscribedRef.current = false
    channelRef.current = null

    if (!subscribe) {
      return
    }

    if (!userId || !accessToken) {
      presenceRef.current = {}
      snapshotRef.current = {}
      localSelfRef.current = {}
      setVoiceChannelOccupants({})
      return
    }
    let cancelled = false
    let localChannel: RealtimeChannel | null = null

    void (async () => {
      try {
        const supabase = await getAuthenticatedSupabase(accessToken)
        if (cancelled) return

        const channel = supabase.channel(VOICE_PRESENCE_TOPIC, {
          config: {
            presence: {
              key: userId,
            },
          },
        })
        localChannel = channel
        channelRef.current = channel

        const flushPresence = () => {
          presenceRef.current = pushVoicePresence(channel)
          flushMerged()
        }

        channel
          .on('presence', { event: 'sync' }, flushPresence)
          .on('presence', { event: 'join' }, flushPresence)
          .on('presence', { event: 'leave' }, flushPresence)

        channel.subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            subscribedRef.current = true
            const s = useAppStore.getState()
            const un =
              (typeof s.profile?.username === 'string' && s.profile.username.trim()) ||
              (typeof s.username === 'string' && s.username.trim()) ||
              ''
            await channel.track({
              user_id: s.userId,
              username: un,
              voiceChannelId: s.activeVoiceChannelId,
              muted: s.localVoiceMuted === true,
              cameraEnabled: s.localCameraEnabled === true,
              screenShareEnabled: s.localScreenShareEnabled === true,
            })
            flushPresence()
          }
        })
      } catch (e) {
        console.warn('Realtime presence voz:', e)
      }
    })()

    const cleanupChannel = () => {
      if (localChannel) {
        void localChannel.untrack()
        const supabase = getSupabaseBrowserClient()
        void supabase.removeChannel(localChannel)
      }
    }

    const onBeforeUnload = () => cleanupChannel()
    window.addEventListener('beforeunload', onBeforeUnload)
    window.addEventListener('pagehide', onBeforeUnload)

    return () => {
      cancelled = true
      subscribedRef.current = false
      channelRef.current = null
      presenceRef.current = {}
      snapshotRef.current = {}
      localSelfRef.current = {}
      window.removeEventListener('beforeunload', onBeforeUnload)
      window.removeEventListener('pagehide', onBeforeUnload)
      cleanupChannel()
      setVoiceChannelOccupants({})
    }
  }, [subscribe, userId, accessToken, setVoiceChannelOccupants])

  const doTrack = useCallback(() => {
    const ch = channelRef.current
    if (!ch || !subscribedRef.current) return
    const s = useAppStore.getState()
    if (!s.userId) return
    const un =
      (typeof s.profile?.username === 'string' && s.profile.username.trim()) ||
      (typeof s.username === 'string' && s.username.trim()) ||
      ''
    void ch.track({
      user_id: s.userId,
      username: un,
      voiceChannelId: s.activeVoiceChannelId,
      muted: s.localVoiceMuted === true,
      cameraEnabled: s.localCameraEnabled === true,
      screenShareEnabled: s.localScreenShareEnabled === true,
    }).then(() => {
      presenceRef.current = pushVoicePresence(ch)
      flushMerged()
    }).catch(() => {})
  }, [])

  // Track inmediato para cambios estables del usuario (canal, mute, cámara, screen share)
  useEffect(() => {
    if (!subscribe) return
    doTrack()
  }, [
    subscribe,
    userId,
    usernameFromProfile,
    usernameFallback,
    activeVoiceChannelId,
    localVoiceMuted,
    localCameraEnabled,
    localScreenShareEnabled,
    doTrack,
  ])

  // Speaking se propaga por LiveKit WebRTC (useLiveKitSpeakers), no por Presence.

  useEffect(() => {
    if (!subscribe) return
    if (!userId) {
      localSelfRef.current = {}
      flushMerged()
      return
    }
    const username =
      (typeof usernameFromProfile === 'string' && usernameFromProfile.trim()) ||
      (typeof usernameFallback === 'string' && usernameFallback.trim()) ||
      userId.slice(0, 8)

    if (activeVoiceChannelId) {
      localSelfRef.current = {
        [activeVoiceChannelId]: [
          {
            userId,
            username,
            isMuted: localVoiceMuted,
            isCameraOn: localCameraEnabled,
            isScreenSharing: localScreenShareEnabled,
            isSpeaking: false,
          },
        ],
      }
    } else {
      localSelfRef.current = {}
    }
    flushMerged()
  }, [
    subscribe,
    userId,
    usernameFromProfile,
    usernameFallback,
    activeVoiceChannelId,
    localVoiceMuted,
    localCameraEnabled,
    localScreenShareEnabled,
    setVoiceChannelOccupants,
  ])

  useEffect(() => {
    if (!subscribe) return

    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | null = null

    const clear = () => {
      if (timer) clearTimeout(timer)
      timer = null
    }

    const loop = async () => {
      try {
        if (!accessToken || !activeServerId) {
          snapshotRef.current = {}
          flushMerged()
        } else {
          const data = await apiGetJson<VoiceParticipantsSnapshot>(
            `/api/servers/${encodeURIComponent(activeServerId)}/voice-participants`,
            accessToken,
          )
          if (!cancelled) {
            snapshotRef.current = normalizeSnapshot(data.byChannel)
            flushMerged()
          }
        }
      } catch {
        // Silencioso: mantenemos presencia local si el snapshot remoto falla.
      } finally {
        if (!cancelled) timer = setTimeout(loop, 7000)
      }
    }

    void loop()

    return () => {
      cancelled = true
      clear()
    }
  }, [subscribe, accessToken, activeServerId, setVoiceChannelOccupants])

  return occupants
}
