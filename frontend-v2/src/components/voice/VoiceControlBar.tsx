import { useEffect, useRef } from 'react';
import { useLocalParticipant, useRoomContext } from '@livekit/components-react';
import { useKrispNoiseFilter } from '@livekit/components-react/krisp';
import { isKrispNoiseFilterSupported } from '@livekit/krisp-noise-filter';
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

  // HOOK OFICIAL DE LIVEKIT (Maneja todo el estado y la inicialización de forma segura)
  const { isNoiseFilterEnabled, setNoiseFilterEnabled, isNoiseFilterPending } = useKrispNoiseFilter({
    filterOptions: { basePath: '/krisp' } as any
  });
  const isNoiseFilterSupported = isKrispNoiseFilterSupported();
  const didAutoEnableAiRef = useRef(false);

  useEffect(() => {
    if (!isNoiseFilterSupported || isNoiseFilterEnabled || didAutoEnableAiRef.current) return;
    didAutoEnableAiRef.current = true;
    void setNoiseFilterEnabled(true).catch((error) => {
      console.error('[Krisp AI Error]', error);
    });
  }, [isNoiseFilterSupported, isNoiseFilterEnabled, setNoiseFilterEnabled]);

  const toggleMicrophone = async () => {
    try {
      await localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled, microphoneCaptureOptions);
    } catch (e) {
      console.warn('Error al alternar micrófono', e);
    }
  };

  const toggleCamera = async () => {
    try {
      await localParticipant.setCameraEnabled(!isCameraEnabled, cameraCaptureOptions, cameraPublishOptions);
    } catch (e) {
      console.warn('Error al alternar cámara', e);
    }
  };

  const toggleScreenShare = async () => {
    try {
      await localParticipant.setScreenShareEnabled(!isScreenShareEnabled, screenShareCaptureOptions, screenSharePublishOptions);
    } catch (e) {
      console.warn('Error al alternar pantalla compartida', e);
    }
  };

  const handleAiToggle = async () => {
    try {
      // Si el micro está apagado, LiveKit necesita que esté encendido antes de activar el filtro
      if (!isMicrophoneEnabled) {
        await localParticipant.setMicrophoneEnabled(true, microphoneCaptureOptions);
      }
      await setNoiseFilterEnabled(!isNoiseFilterEnabled);
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
        }}
        title="Colgar"
      >
        <PhoneOff className="size-4" aria-hidden />
      </Button>
    </div>
  );
}