import { useLocalParticipant, useRoomContext } from '@livekit/components-react'
import { Track } from 'livekit-client'
import { Mic, MicOff, MonitorUp, PhoneOff, Video, VideoOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Toggle } from '@/components/ui/toggle'
import {
  cameraCaptureOptions,
  cameraPublishOptions,
  microphoneCaptureOptions,
  screenShareCaptureOptions,
  screenSharePublishOptions,
} from '@/components/voice/voiceQuality'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store/useAppStore'

const iconToggleClass =
  'size-9 shrink-0 rounded-lg border border-border/60 bg-background/80 p-0 data-[state=on]:bg-muted'

export function VoiceControlBar({ className }: { className?: string }) {
  const {
    isMicrophoneEnabled,
    isCameraEnabled,
    isScreenShareEnabled,
    localParticipant,
  } = useLocalParticipant()
  const room = useRoomContext()
  const setActiveVoiceChannelId = useAppStore((s) => s.setActiveVoiceChannelId)

  const toggleMicrophone = async () => {
    try {
      if (isMicrophoneEnabled) {
        await localParticipant.setMicrophoneEnabled(false)
      } else {
        await localParticipant.setMicrophoneEnabled(true, microphoneCaptureOptions)
      }
    } catch (e) {
      console.warn('Cancelado o error', e)
    }
  }

  const toggleCamera = async () => {
    try {
      if (isCameraEnabled) {
        const pub = localParticipant.getTrackPublication(Track.Source.Camera)
        const media = pub?.track
        if (media) {
          await localParticipant.unpublishTrack(media)
        } else {
          await localParticipant.setCameraEnabled(false)
        }
      } else {
        await localParticipant.setCameraEnabled(
          true,
          cameraCaptureOptions,
          cameraPublishOptions,
        )
      }
    } catch (e) {
      console.warn('Cancelado o error', e)
    }
  }

  const toggleScreenShare = async () => {
    try {
      if (isScreenShareEnabled) {
        await localParticipant.setScreenShareEnabled(false)
      } else {
        await localParticipant.setScreenShareEnabled(
          true,
          screenShareCaptureOptions,
          screenSharePublishOptions,
        )
      }
    } catch (e) {
      console.warn('Cancelado o error', e)
    }
  }

  return (
    <div
      className={cn(
        'flex w-full flex-nowrap items-center justify-center gap-2',
        className,
      )}
      role="toolbar"
      aria-label="Controles de voz"
    >
      <Toggle
        variant="outline"
        pressed={isMicrophoneEnabled}
        onPressedChange={() => void toggleMicrophone()}
        aria-label={isMicrophoneEnabled ? 'Silenciar micrófono' : 'Activar micrófono'}
        title="Micrófono"
        className={iconToggleClass}
      >
        {isMicrophoneEnabled ? <Mic className="size-4" /> : <MicOff className="size-4" />}
      </Toggle>

      <Toggle
        variant="outline"
        pressed={isCameraEnabled}
        onPressedChange={() => void toggleCamera()}
        aria-label={isCameraEnabled ? 'Apagar cámara' : 'Encender cámara'}
        title="Cámara"
        className={iconToggleClass}
      >
        {isCameraEnabled ? <Video className="size-4" /> : <VideoOff className="size-4" />}
      </Toggle>

      <Toggle
        variant="outline"
        pressed={isScreenShareEnabled}
        onPressedChange={() => void toggleScreenShare()}
        aria-label={isScreenShareEnabled ? 'Dejar de compartir' : 'Compartir pantalla'}
        title="Compartir pantalla"
        className={iconToggleClass}
      >
        <MonitorUp className="size-4" />
      </Toggle>

      <Button
        type="button"
        variant="destructive"
        size="icon"
        className="size-9 shrink-0 rounded-lg"
        onClick={() => {
          room.disconnect()
          setActiveVoiceChannelId(null)
        }}
        aria-label="Colgar y salir de la llamada de voz"
        title="Colgar"
      >
        <PhoneOff className="size-4" aria-hidden />
      </Button>
    </div>
  )
}
