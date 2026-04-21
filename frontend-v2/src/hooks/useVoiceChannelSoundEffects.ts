import { useEffect } from 'react'
import { useRoomContext } from '@livekit/components-react'
import { RoomEvent, Track } from 'livekit-client'
import type { LocalTrackPublication } from 'livekit-client'
import type { RemoteParticipant } from 'livekit-client'
import type { RemoteTrackPublication } from 'livekit-client'
import {
  playVoiceParticipantJoined,
  playVoiceParticipantLeft,
  playVoiceScreenShareStarted,
  playVoiceScreenShareStopped,
} from '@/lib/voiceChannelSounds'

function isScreenShareVideoPub(pub: { source: Track.Source; kind: Track.Kind }): boolean {
  return pub.source === Track.Source.ScreenShare && pub.kind === Track.Kind.Video
}

/**
 * Reproduce sonidos cuando alguien entra/sale del canal de voz de LiveKit
 * o publica/deja de publicar vídeo de pantalla compartida.
 * No dispara para participantes que ya estaban al conectarte (API de LiveKit).
 */
export function useVoiceChannelSoundEffects() {
  const room = useRoomContext()

  useEffect(() => {
    const onParticipantJoined = (_participant: RemoteParticipant) => {
      playVoiceParticipantJoined()
    }

    const onParticipantLeft = (_participant: RemoteParticipant) => {
      playVoiceParticipantLeft()
    }

    const onRemoteTrackPublished = (publication: RemoteTrackPublication, _participant: RemoteParticipant) => {
      if (isScreenShareVideoPub(publication)) {
        playVoiceScreenShareStarted()
      }
    }

    const onRemoteTrackUnpublished = (publication: RemoteTrackPublication, _participant: RemoteParticipant) => {
      if (isScreenShareVideoPub(publication)) {
        playVoiceScreenShareStopped()
      }
    }

    const onLocalTrackPublished = (publication: LocalTrackPublication) => {
      if (isScreenShareVideoPub(publication)) {
        playVoiceScreenShareStarted()
      }
    }

    const onLocalTrackUnpublished = (publication: LocalTrackPublication) => {
      if (isScreenShareVideoPub(publication)) {
        playVoiceScreenShareStopped()
      }
    }

    room.on(RoomEvent.ParticipantConnected, onParticipantJoined)
    room.on(RoomEvent.ParticipantDisconnected, onParticipantLeft)
    room.on(RoomEvent.TrackPublished, onRemoteTrackPublished)
    room.on(RoomEvent.TrackUnpublished, onRemoteTrackUnpublished)
    room.on(RoomEvent.LocalTrackPublished, onLocalTrackPublished)
    room.on(RoomEvent.LocalTrackUnpublished, onLocalTrackUnpublished)

    return () => {
      room.off(RoomEvent.ParticipantConnected, onParticipantJoined)
      room.off(RoomEvent.ParticipantDisconnected, onParticipantLeft)
      room.off(RoomEvent.TrackPublished, onRemoteTrackPublished)
      room.off(RoomEvent.TrackUnpublished, onRemoteTrackUnpublished)
      room.off(RoomEvent.LocalTrackPublished, onLocalTrackPublished)
      room.off(RoomEvent.LocalTrackUnpublished, onLocalTrackUnpublished)
    }
  }, [room])
}
