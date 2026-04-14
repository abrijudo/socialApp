import { useEffect } from 'react'
import { RoomEvent } from 'livekit-client'
import type { Participant } from 'livekit-client'
import { useRoomContext } from '@livekit/components-react'
import { useAppStore } from '@/store/useAppStore'

/**
 * Sincroniza el estado de "quién habla" de LiveKit (WebRTC, instantáneo)
 * al store global para que ServerSidebar pueda mostrar el nombre en verde
 * a TODOS los participantes, sin depender de Supabase Presence.
 */
export function useLiveKitSpeakers() {
  const room = useRoomContext()

  useEffect(() => {
    const handler = (speakers: Participant[]) => {
      const map: Record<string, boolean> = {}
      for (const p of speakers) {
        if (p.identity) map[p.identity] = true
      }
      useAppStore.setState({ livekitSpeakers: map })
    }

    room.on(RoomEvent.ActiveSpeakersChanged, handler)

    return () => {
      room.off(RoomEvent.ActiveSpeakersChanged, handler)
      useAppStore.setState({ livekitSpeakers: {} })
    }
  }, [room])
}
