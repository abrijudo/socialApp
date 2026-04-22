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
import {
  createLocalScreenShareTracksFromElectronSource,
  type ElectronScreenCaptureResult,
} from '@/components/voice/electronScreenCapture';
import { createLocalScreenShareTracks } from '@/components/voice/screenShareDisplayMedia';
import {
  cameraCaptureOptions,
  cameraPublishOptions,
  electronNativeScreenAudioPublishOptions,
  microphoneCaptureOptions,
  screenShareCaptureOptions,
  screenSharePublishOptions,
} from '@/components/voice/voiceQuality';
import { cn } from '@/lib/utils';
import { isElectronRuntime } from '@/lib/electron';
import { useAppStore } from '@/store/useAppStore';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const ICON_TOGGLE_CLASS =
  'size-9 shrink-0 rounded-lg border border-border/60 bg-background/80 p-0 data-[state=on]:bg-muted';

const SPEAKING_THRESHOLD = 0.018;
const RELEASE_TAIL_MS = 140;
const MIC_POLL_MAX_ATTEMPTS = 30;
const MIC_POLL_WAIT_MS = 120;

const TOOLTIP_SCREEN_SHARE_WEB =
  "Para compartir sonido sin eco, elige la opción 'Pestaña'.";

const TOOLTIP_SCREEN_SHARE_ELECTRON =
  'Elige ventana o pantalla en el selector nativo.';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Detiene y libera un array de LocalTrack, limpiando WASAPI si procede. */
async function stopTracksAndDispose(
  tracks: LocalTrack[],
  capture?: ElectronScreenCaptureResult,
): Promise<void> {
  await capture?.disposeWasapi?.();
  for (const track of tracks) {
    try { track.stop(); } catch { /* noop */ }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ScreenShareMenu — sub-component
// ─────────────────────────────────────────────────────────────────────────────

interface ScreenShareMenuProps {
  menuRef: React.RefObject<HTMLDivElement | null>;
  onStop: () => void;
  onChange: () => void;
}

function ScreenShareMenu({ menuRef, onStop, onChange }: ScreenShareMenuProps) {
  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label="Opciones de transmisión"
      className="absolute bottom-full left-1/2 z-50 mb-2 w-48 -translate-x-1/2 rounded-lg border border-border bg-background shadow-lg"
    >
      <button
        type="button"
        role="menuitem"
        className="flex w-full items-center gap-2 rounded-t-lg px-3 py-2.5 text-sm text-red-400 hover:bg-muted"
        onClick={onStop}
      >
        <MonitorOff className="size-4" aria-hidden />
        Dejar de transmitir
      </button>
      <button
        type="button"
        role="menuitem"
        className="flex w-full items-center gap-2 rounded-b-lg px-3 py-2.5 text-sm hover:bg-muted"
        onClick={onChange}
      >
        <RefreshCw className="size-4" aria-hidden />
        Cambiar transmisión
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// VoiceControlBar
// ─────────────────────────────────────────────────────────────────────────────

export function VoiceControlBar({ className }: { className?: string }) {
  const {
    isMicrophoneEnabled,
    isCameraEnabled,
    isScreenShareEnabled,
    localParticipant,
  } = useLocalParticipant();

  const room = useRoomContext();

  const setActiveVoiceChannelId   = useAppStore((s) => s.setActiveVoiceChannelId);
  const setLocalVoiceMuted        = useAppStore((s) => s.setLocalVoiceMuted);
  const setLocalCameraEnabled     = useAppStore((s) => s.setLocalCameraEnabled);
  const setLocalScreenShareEnabled = useAppStore((s) => s.setLocalScreenShareEnabled);
  const setLocalVoiceSpeaking     = useAppStore((s) => s.setLocalVoiceSpeaking);

  // ── Screen share state ────────────────────────────────────────────────────
  // Declarado antes de cualquier función que lo use para evitar referencias
  // a variables de estado antes de su inicialización.

  const [screenShareMenuOpen, setScreenShareMenuOpen] = useState(false);
  const screenShareMenuRef    = useRef<HTMLDivElement>(null);
  const [electronPickerOpen, setElectronPickerOpen]   = useState(false);
  const electronShareIntentRef = useRef<'start' | 'change'>('start');
  const wasapiDisposeRef       = useRef<(() => Promise<void>) | null>(null);

  // ── Krisp noise filter ────────────────────────────────────────────────────
  const {
    isNoiseFilterEnabled,
    setNoiseFilterEnabled,
    isNoiseFilterPending,
  } = useKrispNoiseFilter({
    // @ts-expect-error -- basePath no está en los tipos públicos pero es requerido por el WASM de Krisp
    filterOptions: { basePath: '/krisp' },
  });

  const isNoiseFilterSupported = isKrispNoiseFilterSupported();

  // Guards contra doble activación y race conditions en el auto-enable de Krisp
  const didAutoEnableKrispRef    = useRef(false);
  const autoEnableKrispInFlight  = useRef(false);

  // ── Helpers memorizados ───────────────────────────────────────────────────

  const runWasapiDispose = useCallback(async (): Promise<void> => {
    const dispose = wasapiDisposeRef.current;
    wasapiDisposeRef.current = null;
    if (dispose) await dispose();
  }, []);

  /**
   * Espera mediante polling a que el track del micrófono esté publicado en LiveKit.
   * Necesario porque `setNoiseFilterEnabled` falla si se llama antes de que el track
   * exista en la publicación local.
   */
  const waitForMicPublication = useCallback(async (): Promise<boolean> => {
    for (let i = 0; i < MIC_POLL_MAX_ATTEMPTS; i += 1) {
      const publication = localParticipant.getTrackPublication(Track.Source.Microphone);
      if (publication?.track) return true;
      await new Promise<void>((resolve) => { setTimeout(resolve, MIC_POLL_WAIT_MS); });
    }
    return false;
  }, [localParticipant]);

  const applyKrispToMic = useCallback(async (): Promise<void> => {
    const isMicReady = await waitForMicPublication();
    if (!isMicReady) throw new Error('El micrófono no está listo para aplicar el filtro IA.');
    await setNoiseFilterEnabled(true);
  }, [setNoiseFilterEnabled, waitForMicPublication]);

  // ── Auto-aplicar Krisp al activar el mic ──────────────────────────────────
  // No se activa al montar: el mic empieza apagado para que el audio de
  // screen share salga por el altavoz multimedia y no por el auricular.

  useEffect(() => {
    if (!isMicrophoneEnabled) return;
    if (!isNoiseFilterSupported || isNoiseFilterEnabled || isNoiseFilterPending) return;
    if (didAutoEnableKrispRef.current || autoEnableKrispInFlight.current) return;

    autoEnableKrispInFlight.current = true;
    void applyKrispToMic()
      .then(() => { didAutoEnableKrispRef.current = true; })
      .catch((error: unknown) => { console.error('[Krisp] Auto-enable error:', error); })
      .finally(() => { autoEnableKrispInFlight.current = false; });
  }, [
    isMicrophoneEnabled,
    applyKrispToMic,
    isNoiseFilterEnabled,
    isNoiseFilterPending,
    isNoiseFilterSupported,
  ]);

  // ── Store sync ────────────────────────────────────────────────────────────

  useEffect(() => {
    setLocalVoiceMuted(!isMicrophoneEnabled);
  }, [isMicrophoneEnabled, setLocalVoiceMuted]);

  useEffect(() => {
    setLocalCameraEnabled(isCameraEnabled);
  }, [isCameraEnabled, setLocalCameraEnabled]);

  useEffect(() => {
    setLocalScreenShareEnabled(isScreenShareEnabled);
  }, [isScreenShareEnabled, setLocalScreenShareEnabled]);

  // ── Speaking detection (RMS via Web Audio API) ────────────────────────────

  useEffect(() => {
    if (!isMicrophoneEnabled) {
      setLocalVoiceSpeaking(false);
      return;
    }

    const publication = localParticipant.getTrackPublication(Track.Source.Microphone);
    const mediaTrack = (
      publication?.track as unknown as { mediaStreamTrack?: MediaStreamTrack } | undefined
    )?.mediaStreamTrack;

    // Soporte para navegadores que usan el prefijo webkit
    const AudioContextCtor =
      typeof window !== 'undefined'
        ? (
            (window as unknown as { AudioContext?: typeof AudioContext }).AudioContext ??
            (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
          )
        : undefined;

    if (AudioContextCtor != null && mediaTrack != null && typeof MediaStream !== 'undefined') {
      let rafId = 0;
      let released = false;
      let isSpeakingNow = false;
      let holdSpeakingUntil = 0;

      const context = new AudioContextCtor();

      // Algunos navegadores arrancan el contexto en "suspended"; sin resume() el RMS es siempre 0.
      if (context.state === 'suspended') {
        void context.resume().catch(() => { /* noop */ });
      }

      const source   = context.createMediaStreamSource(new MediaStream([mediaTrack]));
      const analyser = context.createAnalyser();
      analyser.fftSize               = 512;
      analyser.smoothingTimeConstant = 0.08;
      source.connect(analyser);

      const data = new Uint8Array(analyser.fftSize);

      const loop = (): void => {
        if (released) return;
        if (context.state === 'suspended') {
          rafId = window.requestAnimationFrame(loop);
          return;
        }

        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i += 1) {
          const normalized = (data[i]! - 128) / 128;
          sum += normalized * normalized;
        }
        const rms = Math.sqrt(sum / data.length);
        const now = performance.now();

        if (rms > SPEAKING_THRESHOLD) holdSpeakingUntil = now + RELEASE_TAIL_MS;

        const nextSpeaking = rms > SPEAKING_THRESHOLD || now < holdSpeakingUntil;
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
        try { source.disconnect(); analyser.disconnect(); } catch { /* noop */ }
        void context.close().catch(() => { /* noop */ });
        setLocalVoiceSpeaking(false);
      };
    }

    // Fallback: evento IsSpeakingChanged de LiveKit cuando Web Audio no está disponible
    const onSpeakingChanged = (speaking: boolean): void => {
      setLocalVoiceSpeaking(Boolean(speaking));
    };

    onSpeakingChanged(Boolean((localParticipant as { isSpeaking?: boolean }).isSpeaking));
    localParticipant.on(ParticipantEvent.IsSpeakingChanged, onSpeakingChanged);

    return () => {
      localParticipant.off(ParticipantEvent.IsSpeakingChanged, onSpeakingChanged);
      setLocalVoiceSpeaking(false);
    };
  }, [isMicrophoneEnabled, localParticipant, setLocalVoiceSpeaking]);

  // ── Cerrar menú al hacer click fuera ─────────────────────────────────────

  useEffect(() => {
    if (!screenShareMenuOpen) return;

    const handleClickOutside = (e: MouseEvent): void => {
      if (
        screenShareMenuRef.current != null &&
        !screenShareMenuRef.current.contains(e.target as Node)
      ) {
        setScreenShareMenuOpen(false);
      }
    };

    document.addEventListener('pointerdown', handleClickOutside);
    return () => { document.removeEventListener('pointerdown', handleClickOutside); };
  }, [screenShareMenuOpen]);

  // ── Microphone ────────────────────────────────────────────────────────────

  const toggleMicrophone = useCallback(async (): Promise<void> => {
    try {
      const next = !isMicrophoneEnabled;
      await localParticipant.setMicrophoneEnabled(next, microphoneCaptureOptions);
      setLocalVoiceMuted(!next);
      if (!next) setLocalVoiceSpeaking(false);
    } catch (e) {
      console.warn('[VoiceControlBar] Error al alternar micrófono:', e);
    }
  }, [isMicrophoneEnabled, localParticipant, setLocalVoiceMuted, setLocalVoiceSpeaking]);

  // ── Camera ────────────────────────────────────────────────────────────────

  const toggleCamera = useCallback(async (): Promise<void> => {
    try {
      const next = !isCameraEnabled;
      await localParticipant.setCameraEnabled(next, cameraCaptureOptions, cameraPublishOptions);
      setLocalCameraEnabled(next);
    } catch (e) {
      console.warn('[VoiceControlBar] Error al alternar cámara:', e);
    }
  }, [isCameraEnabled, localParticipant, setLocalCameraEnabled]);

  // ── Screen share helpers ──────────────────────────────────────────────────

  const unpublishScreenShareAudioIfPublished = useCallback(async (): Promise<void> => {
    const track = localParticipant.getTrackPublication(Track.Source.ScreenShareAudio)?.track;
    if (track == null) return;
    try { await localParticipant.unpublishTrack(track, true); } catch { /* noop */ }
  }, [localParticipant]);

  /**
   * Publica un conjunto de tracks de pantalla en el orden correcto.
   * @remarks CRÍTICO: no usar `setScreenShareEnabled(true)` — solo `publishTrack` manual.
   * El audio debe publicarse antes que el vídeo para evitar condiciones de carrera SFU/WebRTC.
   */
  const publishLocalScreenShareTracks = useCallback(async (tracks: LocalTrack[]): Promise<void> => {
    const ordered = [...tracks].sort((a, b) => {
      const isAudio = (t: LocalTrack): boolean => t.source === Track.Source.ScreenShareAudio;
      return Number(isAudio(b)) - Number(isAudio(a));
    });

    for (const track of ordered) {
      const opts =
        track.source === Track.Source.ScreenShareAudio
          ? electronNativeScreenAudioPublishOptions
          : screenSharePublishOptions;
      await localParticipant.publishTrack(track, opts);
    }
    setLocalScreenShareEnabled(true);
  }, [localParticipant, setLocalScreenShareEnabled]);

  /**
   * Captura desde una fuente Electron y publica los tracks resultantes.
   * Usado tanto en 'start' como en 'change' (en 'change' se hace teardown antes de llamar).
   */
  const captureElectronAndPublish = useCallback(async (
    payload: ElectronShareConfirmPayload,
  ): Promise<void> => {
    let capture: ElectronScreenCaptureResult;
    try {
      capture = await createLocalScreenShareTracksFromElectronSource(payload.sourceId, {
        captureAudio: payload.captureAudio,
        kind:         payload.kind,
        processId:    payload.processId,
      });
    } catch (e) {
      console.warn('[VoiceControlBar] Error al capturar escritorio en Electron:', e);
      return;
    }

    if (capture.tracks == null || capture.tracks.length === 0) return;

    try {
      await publishLocalScreenShareTracks(capture.tracks);
      wasapiDisposeRef.current = capture.disposeWasapi ?? null;
    } catch (e) {
      console.warn('[VoiceControlBar] Error al publicar captura Electron:', e);
      await stopTracksAndDispose(capture.tracks, capture);
    }
  }, [publishLocalScreenShareTracks]);

  const startScreenShareWeb = useCallback(async (): Promise<void> => {
    let tracks: LocalTrack[] | null = null;
    try {
      tracks = await createLocalScreenShareTracks(screenShareCaptureOptions);
    } catch (e) {
      console.warn('[VoiceControlBar] Error al iniciar pantalla compartida:', e);
      return;
    }
    if (tracks == null || tracks.length === 0) return;

    try {
      await publishLocalScreenShareTracks(tracks);
    } catch (e) {
      console.warn('[VoiceControlBar] Error al publicar pantalla compartida:', e);
      await stopTracksAndDispose(tracks);
    }
  }, [publishLocalScreenShareTracks]);

  const stopScreenShare = useCallback(async (): Promise<void> => {
    try {
      await runWasapiDispose();
      await unpublishScreenShareAudioIfPublished();
      await localParticipant.setScreenShareEnabled(false);
      setLocalScreenShareEnabled(false);
    } catch (e) {
      console.warn('[VoiceControlBar] Error al detener pantalla compartida:', e);
    }
  }, [
    localParticipant,
    runWasapiDispose,
    setLocalScreenShareEnabled,
    unpublishScreenShareAudioIfPublished,
  ]);

  // ── Screen share event handlers ───────────────────────────────────────────

  const handleScreenShareButton = useCallback((): void => {
    if (isScreenShareEnabled) {
      setScreenShareMenuOpen((prev) => !prev);
      return;
    }
    if (isElectronRuntime()) {
      electronShareIntentRef.current = 'start';
      setElectronPickerOpen(true);
    } else {
      void startScreenShareWeb();
    }
  }, [isScreenShareEnabled, startScreenShareWeb]);

  const handleStopScreenShare = useCallback((): void => {
    setScreenShareMenuOpen(false);
    void stopScreenShare();
  }, [stopScreenShare]);

  const handleChangeScreenShare = useCallback((): void => {
    setScreenShareMenuOpen(false);
    if (isElectronRuntime()) {
      electronShareIntentRef.current = 'change';
      setElectronPickerOpen(true);
      return;
    }

    void (async () => {
      let newTracks: LocalTrack[] | null = null;
      try {
        newTracks = await createLocalScreenShareTracks(screenShareCaptureOptions);
      } catch {
        return;
      }
      if (newTracks == null || newTracks.length === 0) return;

      try {
        await unpublishScreenShareAudioIfPublished();
        await localParticipant.setScreenShareEnabled(false);
        await publishLocalScreenShareTracks(newTracks);
      } catch (e) {
        console.warn('[VoiceControlBar] Error al cambiar pantalla compartida:', e);
        await stopTracksAndDispose(newTracks);
      }
    })();
  }, [localParticipant, publishLocalScreenShareTracks, unpublishScreenShareAudioIfPublished]);

  const onElectronPickerConfirm = useCallback(async (
    payload: ElectronShareConfirmPayload,
  ): Promise<void> => {
    await runWasapiDispose();

    if (electronShareIntentRef.current === 'change') {
      try {
        await unpublishScreenShareAudioIfPublished();
        await localParticipant.setScreenShareEnabled(false);
      } catch (e) {
        console.warn('[VoiceControlBar] Error en teardown de pantalla anterior (Electron):', e);
      }
    }

    await captureElectronAndPublish(payload);
  }, [
    captureElectronAndPublish,
    localParticipant,
    runWasapiDispose,
    unpublishScreenShareAudioIfPublished,
  ]);

  // ── Krisp AI toggle ───────────────────────────────────────────────────────

  const handleAiToggle = useCallback(async (): Promise<void> => {
    try {
      if (isNoiseFilterEnabled) {
        await setNoiseFilterEnabled(false);
        return;
      }
      if (!isMicrophoneEnabled) {
        await localParticipant.setMicrophoneEnabled(true, microphoneCaptureOptions);
        setLocalVoiceMuted(false);
      }
      await applyKrispToMic();
    } catch (error) {
      console.error('[Krisp] Toggle error:', error);
    }
  }, [
    applyKrispToMic,
    isMicrophoneEnabled,
    isNoiseFilterEnabled,
    localParticipant,
    setLocalVoiceMuted,
    setNoiseFilterEnabled,
  ]);

  // ── Disconnect ────────────────────────────────────────────────────────────

  const handleDisconnect = useCallback((): void => {
    room.disconnect();
    setActiveVoiceChannelId(null);
    setLocalVoiceMuted(true);
    setLocalCameraEnabled(false);
    setLocalScreenShareEnabled(false);
    setLocalVoiceSpeaking(false);
  }, [
    room,
    setActiveVoiceChannelId,
    setLocalCameraEnabled,
    setLocalScreenShareEnabled,
    setLocalVoiceMuted,
    setLocalVoiceSpeaking,
  ]);

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <TooltipProvider>
      <div
        className={cn('flex w-full flex-nowrap items-center justify-center gap-2', className)}
        role="toolbar"
        aria-label="Controles de voz"
      >
        {/* Micrófono */}
        <Toggle
          variant="outline"
          pressed={isMicrophoneEnabled}
          onPressedChange={() => { void toggleMicrophone(); }}
          aria-label={isMicrophoneEnabled ? 'Silenciar micrófono' : 'Activar micrófono'}
          title="Micrófono"
          className={ICON_TOGGLE_CLASS}
        >
          {isMicrophoneEnabled
            ? <Mic    className="size-4" aria-hidden />
            : <MicOff className="size-4" aria-hidden />}
        </Toggle>

        {/* Krisp AI */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => { void handleAiToggle(); }}
              disabled={isNoiseFilterPending || !isNoiseFilterSupported}
              aria-label={
                !isNoiseFilterSupported
                  ? 'Supresión de ruido IA no soportada'
                  : isNoiseFilterEnabled
                    ? 'Desactivar supresión de ruido IA'
                    : 'Activar supresión de ruido IA'
              }
              aria-pressed={isNoiseFilterEnabled}
              className={cn(
                'size-9 shrink-0 rounded-lg border border-border/60 p-0 transition-colors',
                'flex items-center justify-center text-[10px] font-bold font-mono',
                isNoiseFilterEnabled
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-background/80 text-muted-foreground hover:bg-muted',
                (isNoiseFilterPending || !isNoiseFilterSupported) &&
                  'cursor-not-allowed opacity-50',
              )}
            >
              IA
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">
            {!isNoiseFilterSupported
              ? 'Supresión de ruido IA no soportada en este navegador'
              : isNoiseFilterEnabled
                ? 'Desactivar supresión de ruido IA'
                : 'Activar supresión de ruido IA'}
          </TooltipContent>
        </Tooltip>

        {/* Cámara */}
        <Toggle
          variant="outline"
          pressed={isCameraEnabled}
          onPressedChange={() => { void toggleCamera(); }}
          aria-label={isCameraEnabled ? 'Apagar cámara' : 'Encender cámara'}
          title="Cámara"
          className={ICON_TOGGLE_CLASS}
        >
          {isCameraEnabled
            ? <Video    className="size-4" aria-hidden />
            : <VideoOff className="size-4" aria-hidden />}
        </Toggle>

        {/* Compartir pantalla */}
        <div className="relative">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={handleScreenShareButton}
                aria-label={
                  isScreenShareEnabled ? 'Opciones de transmisión' : 'Compartir pantalla'
                }
                aria-expanded={isScreenShareEnabled ? screenShareMenuOpen : undefined}
                aria-haspopup={isScreenShareEnabled ? 'menu' : undefined}
                className={cn(
                  ICON_TOGGLE_CLASS,
                  'inline-flex items-center justify-center',
                  isScreenShareEnabled &&
                    'border-red-700 bg-red-600 text-white hover:bg-red-700',
                )}
              >
                {isScreenShareEnabled
                  ? <MonitorOff className="size-4" aria-hidden />
                  : <MonitorUp  className="size-4" aria-hidden />}
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">
              {isScreenShareEnabled
                ? 'Cambiar o detener la transmisión.'
                : isElectronRuntime()
                  ? TOOLTIP_SCREEN_SHARE_ELECTRON
                  : TOOLTIP_SCREEN_SHARE_WEB}
            </TooltipContent>
          </Tooltip>

          <ElectronDesktopPicker
            open={electronPickerOpen}
            onOpenChange={setElectronPickerOpen}
            onConfirm={(payload) => { void onElectronPickerConfirm(payload); }}
          />

          {screenShareMenuOpen && (
            <ScreenShareMenu
              menuRef={screenShareMenuRef}
              onStop={handleStopScreenShare}
              onChange={handleChangeScreenShare}
            />
          )}
        </div>

        {/* Colgar */}
        <Button
          type="button"
          variant="destructive"
          size="icon"
          className="size-9 shrink-0 rounded-lg"
          onClick={handleDisconnect}
          aria-label="Colgar y salir del canal de voz"
          title="Colgar"
        >
          <PhoneOff className="size-4" aria-hidden />
        </Button>
      </div>
    </TooltipProvider>
  );
}