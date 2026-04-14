import { useCallback, useEffect, useRef } from 'react';
import { useLocalParticipant, useRoomContext } from '@livekit/components-react';
import { useKrispNoiseFilter } from '@livekit/components-react/krisp';
import { isKrispNoiseFilterSupported } from '@livekit/krisp-noise-filter';
import { ParticipantEvent, Track } from 'livekit-client';
import { Mic, MicOff, MonitorUp, PhoneOff, Video, VideoOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Toggle } from '@/components/ui/toggle';
import {
  cameraCaptureOptions,
  cameraPublishOptions,
  microphoneCaptureOptions,
  screenShareCaptureOptions,
  screenSharePublishOptions,
} from '@/components/voice/voiceQuality';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/useAppStore';

const iconToggleClass =
  'size-9 shrink-0 rounded-lg border border-border/60 bg-background/80 p-0 data-[state=on]:bg-muted';

export function VoiceControlBar({ className }: { className?: string }) {
  const {
    isMicrophoneEnabled,
    isCameraEnabled,
    isScreenShareEnabled,
    localParticipant,
  } = useLocalParticipant();
  const room = useRoomContext();
  const setActiveVoiceChannelId = useAppStore((s) => s.setActiveVoiceChannelId);
  const setLocalVoiceMuted = useAppStore((s) => s.setLocalVoiceMuted);
  const setLocalCameraEnabled = useAppStore((s) => s.setLocalCameraEnabled);
  const setLocalScreenShareEnabled = useAppStore((s) => s.setLocalScreenShareEnabled);
  const setLocalVoiceSpeaking = useAppStore((s) => s.setLocalVoiceSpeaking);

  // HOOK OFICIAL DE LIVEKIT (Maneja todo el estado y la inicialización de forma segura)
  const { isNoiseFilterEnabled, setNoiseFilterEnabled, isNoiseFilterPending } = useKrispNoiseFilter({
    filterOptions: { basePath: '/krisp' } as any
  });
  const isNoiseFilterSupported = isKrispNoiseFilterSupported();
  const didAutoEnableAiRef = useRef(false);
  const autoEnableInFlightRef = useRef(false);

  const waitForMicPublication = useCallback(async (maxAttempts = 30, waitMs = 120) => {
    for (let i = 0; i < maxAttempts; i += 1) {
      const publication = localParticipant.getTrackPublication(Track.Source.Microphone);
      if (publication?.track) return true;
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
    return false;
  }, [localParticipant]);

  const enableAiNoiseSuppression = useCallback(async () => {
    if (!isMicrophoneEnabled) {
      await localParticipant.setMicrophoneEnabled(true, microphoneCaptureOptions);
      setLocalVoiceMuted(false);
    }
    const isMicReady = await waitForMicPublication();
    if (!isMicReady) {
      throw new Error('El micrófono todavía no está listo para aplicar IA.');
    }
    await setNoiseFilterEnabled(true);
  }, [
    isMicrophoneEnabled,
    localParticipant,
    setLocalVoiceMuted,
    setNoiseFilterEnabled,
    waitForMicPublication,
  ]);

  useEffect(() => {
    if (!isNoiseFilterSupported || isNoiseFilterEnabled || isNoiseFilterPending) return;
    if (didAutoEnableAiRef.current || autoEnableInFlightRef.current) return;
    autoEnableInFlightRef.current = true;

    void enableAiNoiseSuppression()
      .then(() => {
        didAutoEnableAiRef.current = true;
      })
      .catch((error) => {
        // Dejamos el botón utilizable manualmente y permitimos reintento automático posterior.
        console.error('[Krisp AI Error]', error);
      })
      .finally(() => {
        autoEnableInFlightRef.current = false;
      });
  }, [
    enableAiNoiseSuppression,
    isNoiseFilterEnabled,
    isNoiseFilterPending,
    isNoiseFilterSupported,
  ]);

  useEffect(() => {
    setLocalVoiceMuted(!isMicrophoneEnabled);
  }, [isMicrophoneEnabled, setLocalVoiceMuted]);

  useEffect(() => {
    setLocalCameraEnabled(isCameraEnabled);
  }, [isCameraEnabled, setLocalCameraEnabled]);

  useEffect(() => {
    setLocalScreenShareEnabled(isScreenShareEnabled);
  }, [isScreenShareEnabled, setLocalScreenShareEnabled]);

  useEffect(() => {
    const participant = room.localParticipant ?? localParticipant;
    const apply = (speaking: boolean) => {
      setLocalVoiceSpeaking(Boolean(speaking));
    };

    apply(Boolean((participant as { isSpeaking?: boolean })?.isSpeaking));
    participant.on(ParticipantEvent.IsSpeakingChanged, apply);
    return () => {
      participant.off(ParticipantEvent.IsSpeakingChanged, apply);
      setLocalVoiceSpeaking(false);
    };
  }, [localParticipant, room.localParticipant, setLocalVoiceSpeaking]);

  const toggleMicrophone = async () => {
    try {
      const nextMicEnabled = !isMicrophoneEnabled;
      await localParticipant.setMicrophoneEnabled(nextMicEnabled, microphoneCaptureOptions);
      setLocalVoiceMuted(!nextMicEnabled);
      if (!nextMicEnabled) {
        setLocalVoiceSpeaking(false);
      }
    } catch (e) {
      console.warn('Error al alternar micrófono', e);
    }
  };

  const toggleCamera = async () => {
    try {
      const nextCameraEnabled = !isCameraEnabled;
      await localParticipant.setCameraEnabled(
        nextCameraEnabled,
        cameraCaptureOptions,
        cameraPublishOptions,
      );
      setLocalCameraEnabled(nextCameraEnabled);
    } catch (e) {
      console.warn('Error al alternar cámara', e);
    }
  };

  const toggleScreenShare = async () => {
    try {
      const nextScreenShareEnabled = !isScreenShareEnabled;
      await localParticipant.setScreenShareEnabled(
        nextScreenShareEnabled,
        screenShareCaptureOptions,
        screenSharePublishOptions,
      );
      setLocalScreenShareEnabled(nextScreenShareEnabled);
    } catch (e) {
      console.warn('Error al alternar pantalla compartida', e);
    }
  };

  const handleAiToggle = async () => {
    try {
      if (isNoiseFilterEnabled) {
        await setNoiseFilterEnabled(false);
      } else {
        await enableAiNoiseSuppression();
      }
    } catch (error) {
      console.error('[Krisp AI Error]', error);
    }
  };

  return (
    <div
      className={cn('flex w-full flex-nowrap items-center justify-center gap-2', className)}
      role="toolbar"
      aria-label="Controles de voz"
    >
      <Toggle
        variant="outline"
        pressed={isMicrophoneEnabled}
        onPressedChange={toggleMicrophone}
        aria-label={isMicrophoneEnabled ? 'Silenciar micrófono' : 'Activar micrófono'}
        title="Micrófono"
        className={iconToggleClass}
      >
        {isMicrophoneEnabled ? <Mic className="size-4" /> : <MicOff className="size-4" />}
      </Toggle>

      {/* BOTÓN DE IA RESTAURADO Y SEGURO */}
      <button
        type="button"
        onClick={handleAiToggle}
        disabled={isNoiseFilterPending || !isNoiseFilterSupported}
        className={cn(
          'size-9 shrink-0 rounded-lg border border-border/60 p-0 transition-colors',
          'flex items-center justify-center text-[10px] font-bold font-mono',
          isNoiseFilterEnabled
            ? 'bg-primary text-primary-foreground'
            : 'bg-background/80 text-muted-foreground hover:bg-muted',
          (isNoiseFilterPending || !isNoiseFilterSupported) && 'opacity-50 cursor-not-allowed'
        )}
        title={!isNoiseFilterSupported ? 'IA no soportada' : 'Supresión de ruido IA'}
      >
        IA
      </button>

      <Toggle
        variant="outline"
        pressed={isCameraEnabled}
        onPressedChange={toggleCamera}
        aria-label={isCameraEnabled ? 'Apagar cámara' : 'Encender cámara'}
        title="Cámara"
        className={iconToggleClass}
      >
        {isCameraEnabled ? <Video className="size-4" /> : <VideoOff className="size-4" />}
      </Toggle>

      <Toggle
        variant="outline"
        pressed={isScreenShareEnabled}
        onPressedChange={toggleScreenShare}
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
          room.disconnect();
          setActiveVoiceChannelId(null);
          setLocalVoiceMuted(true);
          setLocalCameraEnabled(false);
          setLocalScreenShareEnabled(false);
          setLocalVoiceSpeaking(false);
        }}
        title="Colgar"
      >
        <PhoneOff className="size-4" aria-hidden />
      </Button>
    </div>
  );
}