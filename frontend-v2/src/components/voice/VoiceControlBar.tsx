import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocalParticipant, useRoomContext } from '@livekit/components-react';
import { useKrispNoiseFilter } from '@livekit/components-react/krisp';
import { isKrispNoiseFilterSupported } from '@livekit/krisp-noise-filter';
import { LocalTrack, ParticipantEvent, Track } from 'livekit-client';
import { Mic, MicOff, MonitorOff, MonitorUp, PhoneOff, RefreshCw, Video, VideoOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Toggle } from '@/components/ui/toggle';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  ElectronDesktopPicker,
  type ElectronShareConfirmPayload,
} from '@/components/voice/ElectronDesktopPicker';
import { createLocalScreenShareTracksFromElectronSource } from '@/components/voice/electronScreenCapture';
import { createLocalScreenShareTracks } from '@/components/voice/screenShareDisplayMedia';
import {
  cameraCaptureOptions,
  cameraPublishOptions,
  microphoneCaptureOptions,
  screenShareCaptureOptions,
  screenSharePublishOptions,
} from '@/components/voice/voiceQuality';
import { cn } from '@/lib/utils';
import { isElectronRuntime } from '@/lib/electron';
import { useAppStore } from '@/store/useAppStore';

const iconToggleClass =
  'size-9 shrink-0 rounded-lg border border-border/60 bg-background/80 p-0 data-[state=on]:bg-muted';

const SCREEN_SHARE_WEB_TOOLTIP =
  "Para compartir sonido sin eco, elige la opción 'Pestaña'.";

const SCREEN_SHARE_ELECTRON_TOOLTIP = 'Elige ventana o pantalla en el selector nativo.';

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
    // @ts-expect-error -- basePath no está en los tipos oficiales pero es requerido por Krisp WASM
    filterOptions: { basePath: '/krisp' },
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

  const applyKrispToMic = useCallback(async () => {
    const isMicReady = await waitForMicPublication();
    if (!isMicReady) {
      throw new Error('El micrófono todavía no está listo para aplicar IA.');
    }
    await setNoiseFilterEnabled(true);
  }, [setNoiseFilterEnabled, waitForMicPublication]);

  // Auto-aplicar Krisp cuando el mic se activa (no al montar; el mic empieza apagado
  // para que el audio de screen share salga por el altavoz multimedia en vez del auricular).
  useEffect(() => {
    if (!isMicrophoneEnabled) return;
    if (!isNoiseFilterSupported || isNoiseFilterEnabled || isNoiseFilterPending) return;
    if (didAutoEnableAiRef.current || autoEnableInFlightRef.current) return;
    autoEnableInFlightRef.current = true;

    void applyKrispToMic()
      .then(() => {
        didAutoEnableAiRef.current = true;
      })
      .catch((error) => {
        console.error('[Krisp AI Error]', error);
      })
      .finally(() => {
        autoEnableInFlightRef.current = false;
      });
  }, [
    isMicrophoneEnabled,
    applyKrispToMic,
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
    if (!isMicrophoneEnabled) {
      setLocalVoiceSpeaking(false);
      return () => {};
    }

    const publication = localParticipant.getTrackPublication(Track.Source.Microphone);
    const mediaTrack = (
      publication?.track as unknown as { mediaStreamTrack?: MediaStreamTrack } | undefined
    )?.mediaStreamTrack;
    const AudioContextCtor =
      typeof window !== 'undefined'
        ? ((window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
        : undefined;

    if (AudioContextCtor && mediaTrack && typeof MediaStream !== 'undefined') {
      let rafId = 0;
      let released = false;
      let isSpeakingNow = false;
      let holdSpeakingUntil = 0;
      const speakingThreshold = 0.018;
      const releaseTailMs = 140;
      const context = new AudioContextCtor();

      // Algunos navegadores arrancan el contexto en "suspended"; sin resume() el análisis RMS es nulo.
      if (context.state === 'suspended') {
        void context.resume().catch(() => {});
      }

      const source = context.createMediaStreamSource(new MediaStream([mediaTrack]));
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.08;
      source.connect(analyser);
      const data = new Uint8Array(analyser.fftSize);

      const loop = () => {
        if (released) return;
        if (context.state === 'suspended') {
          rafId = window.requestAnimationFrame(loop);
          return;
        }
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i += 1) {
          const normalized = (data[i] - 128) / 128;
          sum += normalized * normalized;
        }
        const rms = Math.sqrt(sum / data.length);
        const now = performance.now();
        if (rms > speakingThreshold) {
          holdSpeakingUntil = now + releaseTailMs;
        }
        const nextSpeaking = rms > speakingThreshold || now < holdSpeakingUntil;
        if (nextSpeaking !== isSpeakingNow) {
          isSpeakingNow = nextSpeaking;
          setLocalVoiceSpeaking(nextSpeaking);
        }
        rafId = window.requestAnimationFrame(loop);
      };

      rafId = window.requestAnimationFrame(loop);
      return () => {
        released = true;
        window.cancelAnimationFrame(rafId);
        try {
          source.disconnect();
          analyser.disconnect();
        } catch {
          // noop
        }
        void context.close().catch(() => {});
        setLocalVoiceSpeaking(false);
      };
    }

    // Fallback si AudioContext no está disponible.
    const apply = (speaking: boolean) => {
      setLocalVoiceSpeaking(Boolean(speaking));
    };
    apply(Boolean((participant as { isSpeaking?: boolean })?.isSpeaking));
    participant.on(ParticipantEvent.IsSpeakingChanged, apply);
    return () => {
      participant.off(ParticipantEvent.IsSpeakingChanged, apply);
      setLocalVoiceSpeaking(false);
    };
  }, [isMicrophoneEnabled, localParticipant, room.localParticipant, setLocalVoiceSpeaking]);

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

  const [screenShareMenuOpen, setScreenShareMenuOpen] = useState(false);
  const screenShareMenuRef = useRef<HTMLDivElement>(null);
  const [electronPickerOpen, setElectronPickerOpen] = useState(false);
  const electronShareIntentRef = useRef<'start' | 'change'>('start');

  useEffect(() => {
    if (!screenShareMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (screenShareMenuRef.current && !screenShareMenuRef.current.contains(e.target as Node)) {
        setScreenShareMenuOpen(false);
      }
    };
    document.addEventListener('pointerdown', handleClickOutside);
    return () => document.removeEventListener('pointerdown', handleClickOutside);
  }, [screenShareMenuOpen]);

  const unpublishLocalScreenShareAudioIfPublished = async () => {
    const pub = localParticipant.getTrackPublication(Track.Source.ScreenShareAudio);
    const t = pub?.track;
    if (!t) return;
    try {
      await localParticipant.unpublishTrack(t, true);
    } catch {
      // noop
    }
  };

  // CRÍTICO: no usar setScreenShareEnabled(true): solo publishTrack manual.
  const publishLocalScreenShareTracks = async (tracks: LocalTrack[]) => {
    for (const track of tracks) {
      await localParticipant.publishTrack(track, screenSharePublishOptions);
    }
    setLocalScreenShareEnabled(true);
  };

  const startScreenShareWeb = async () => {
    try {
      const tracks = await createLocalScreenShareTracks(screenShareCaptureOptions);
      if (!tracks || tracks.length === 0) return;
      try {
        await publishLocalScreenShareTracks(tracks);
      } catch (e) {
        console.warn('Error al publicar pantalla compartida', e);
        for (const track of tracks) {
          try {
            track.stop();
          } catch {
            // noop
          }
        }
      }
    } catch (e) {
      console.warn('Error al iniciar pantalla compartida', e);
    }
  };

  const onElectronPickerConfirm = async (payload: ElectronShareConfirmPayload) => {
    if (electronShareIntentRef.current === 'change') {
      let newTracks: Awaited<ReturnType<typeof createLocalScreenShareTracksFromElectronSource>> | null = null;
      try {
        newTracks = await createLocalScreenShareTracksFromElectronSource(payload.sourceId, {
          captureAudio: payload.captureAudio,
          kind: payload.kind,
        });
      } catch {
        return;
      }
      if (!newTracks || newTracks.length === 0) return;
      try {
        await unpublishLocalScreenShareAudioIfPublished();
        await localParticipant.setScreenShareEnabled(false);
        await publishLocalScreenShareTracks(newTracks);
      } catch (e) {
        console.warn('Error al cambiar pantalla compartida (Electron)', e);
        for (const track of newTracks) {
          try {
            track.stop();
          } catch {
            // noop
          }
        }
      }
      return;
    }
    let tracks: Awaited<ReturnType<typeof createLocalScreenShareTracksFromElectronSource>> | null = null;
    try {
      tracks = await createLocalScreenShareTracksFromElectronSource(payload.sourceId, {
        captureAudio: payload.captureAudio,
        kind: payload.kind,
      });
    } catch (e) {
      console.warn('Error al capturar escritorio en Electron', e);
      return;
    }
    if (!tracks || tracks.length === 0) return;
    try {
      await publishLocalScreenShareTracks(tracks);
    } catch (e) {
      console.warn('Error al publicar captura Electron', e);
      for (const track of tracks) {
        try {
          track.stop();
        } catch {
          // noop
        }
      }
    }
  };

  const stopScreenShare = async () => {
    try {
      await unpublishLocalScreenShareAudioIfPublished();
      await localParticipant.setScreenShareEnabled(false);
      setLocalScreenShareEnabled(false);
    } catch (e) {
      console.warn('Error al detener pantalla compartida', e);
    }
  };

  const handleScreenShareButton = () => {
    if (isScreenShareEnabled) {
      setScreenShareMenuOpen((prev) => !prev);
    } else if (isElectronRuntime()) {
      electronShareIntentRef.current = 'start';
      setElectronPickerOpen(true);
    } else {
      void startScreenShareWeb();
    }
  };

  const handleStopScreenShare = () => {
    setScreenShareMenuOpen(false);
    void stopScreenShare();
  };

  const handleChangeScreenShare = () => {
    setScreenShareMenuOpen(false);
    if (isElectronRuntime()) {
      electronShareIntentRef.current = 'change';
      setElectronPickerOpen(true);
      return;
    }
    void (async () => {
      let newTracks: Awaited<ReturnType<typeof createLocalScreenShareTracks>> | null = null;
      try {
        newTracks = await createLocalScreenShareTracks(screenShareCaptureOptions);
      } catch {
        return;
      }
      if (!newTracks || newTracks.length === 0) return;
      try {
        await unpublishLocalScreenShareAudioIfPublished();
        await localParticipant.setScreenShareEnabled(false);
        await publishLocalScreenShareTracks(newTracks);
      } catch (e) {
        console.warn('Error al cambiar pantalla compartida', e);
        for (const track of newTracks) {
          try {
            track.stop();
          } catch {
            // noop
          }
        }
      }
    })();
  };

  const handleAiToggle = async () => {
    try {
      if (isNoiseFilterEnabled) {
        await setNoiseFilterEnabled(false);
      } else {
        if (!isMicrophoneEnabled) {
          await localParticipant.setMicrophoneEnabled(true, microphoneCaptureOptions);
          setLocalVoiceMuted(false);
        }
        await applyKrispToMic();
      }
    } catch (error) {
      console.error('[Krisp AI Error]', error);
    }
  };

  return (
    <TooltipProvider>
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

      {/* BOT��N DE IA RESTAURADO Y SEGURO */}
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

      <div className="relative" ref={screenShareMenuRef}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={handleScreenShareButton}
              aria-label={isScreenShareEnabled ? 'Opciones de transmisión' : 'Compartir pantalla'}
              title={isScreenShareEnabled ? 'Opciones de transmisión' : 'Compartir pantalla'}
              className={cn(
                iconToggleClass,
                'inline-flex items-center justify-center',
                isScreenShareEnabled && 'bg-red-600 text-white border-red-700 hover:bg-red-700',
              )}
            >
              {isScreenShareEnabled ? <MonitorOff className="size-4" /> : <MonitorUp className="size-4" />}
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">
            {isScreenShareEnabled
              ? 'Cambiar o detener la transmisión.'
              : isElectronRuntime()
                ? SCREEN_SHARE_ELECTRON_TOOLTIP
                : SCREEN_SHARE_WEB_TOOLTIP}
          </TooltipContent>
        </Tooltip>

        <ElectronDesktopPicker
          open={electronPickerOpen}
          onOpenChange={setElectronPickerOpen}
          onConfirm={(payload) => {
            void onElectronPickerConfirm(payload);
          }}
        />

        {screenShareMenuOpen && (
          <div className="absolute bottom-full left-1/2 z-50 mb-2 w-48 -translate-x-1/2 rounded-lg border border-border bg-background shadow-lg">
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-t-lg px-3 py-2.5 text-sm text-red-400 hover:bg-muted"
              onClick={handleStopScreenShare}
            >
              <MonitorOff className="size-4" />
              Dejar de transmitir
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-b-lg px-3 py-2.5 text-sm text-white hover:bg-muted"
              onClick={handleChangeScreenShare}
            >
              <RefreshCw className="size-4" />
              Cambiar transmisión
            </button>
          </div>
        )}
      </div>

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
    </TooltipProvider>
  );
}