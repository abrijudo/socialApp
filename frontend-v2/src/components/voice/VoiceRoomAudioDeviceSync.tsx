import { useEffect, useRef } from 'react'
import { useRoomContext } from '@livekit/components-react'
import { ConnectionState, Room, RoomEvent } from 'livekit-client'
import { useAppStore } from '@/store/useAppStore'

async function syncRoomAudioDevices(
  room: Room,
  micPreferred: string | null,
  speakerPreferred: string | null,
): Promise<void> {
  if (room.state !== ConnectionState.Connected) return

  try {
    if (micPreferred?.trim()) {
      await room.switchActiveDevice('audioinput', micPreferred.trim(), true)
    } else {
      const inputs = await Room.getLocalDevices('audioinput', false)
      const def = inputs[0]?.deviceId
      if (def) await room.switchActiveDevice('audioinput', def, false)
    }

    const outputs = await Room.getLocalDevices('audiooutput', false)
    if (outputs.length === 0) return

    if (speakerPreferred?.trim()) {
      await room.switchActiveDevice('audiooutput', speakerPreferred.trim(), true)
    } else {
      const defOut = outputs[0]?.deviceId
      if (defOut) await room.switchActiveDevice('audiooutput', defOut, false)
    }
  } catch (e) {
    console.warn('[VoiceRoomAudioDeviceSync] No se pudo aplicar dispositivo de audio:', e)
  }
}

/**
 * Aplica los micrófonos / salidas guardados en el store cuando la sala LiveKit está conectada.
 */
export function VoiceRoomAudioDeviceSync() {
  const room = useRoomContext()
  const micPref = useAppStore((s) => s.preferredVoiceMicDeviceId)
  const speakerPref = useAppStore((s) => s.preferredVoiceSpeakerDeviceId)
  const inFlight = useRef(false)

  useEffect(() => {
    if (!room) return
    const run = (): void => {
      if (inFlight.current) return
      inFlight.current = true
      void syncRoomAudioDevices(room, micPref, speakerPref).finally(() => {
        inFlight.current = false
      })
    }

    if (room.state === ConnectionState.Connected) run()

    const onState = (state: ConnectionState): void => {
      if (state === ConnectionState.Connected) run()
    }
    const onReconnected = (): void => {
      run()
    }

    room.on(RoomEvent.ConnectionStateChanged, onState)
    room.on(RoomEvent.Reconnected, onReconnected)

    return () => {
      room.off(RoomEvent.ConnectionStateChanged, onState)
      room.off(RoomEvent.Reconnected, onReconnected)
    }
  }, [room, micPref, speakerPref])

  return null
}
