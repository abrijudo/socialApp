import type { LocalTrack, ScreenShareCaptureOptions } from 'livekit-client'
import {
  DeviceUnsupportedError,
  LocalAudioTrack,
  LocalVideoTrack,
  Track,
  TrackInvalidError,
} from 'livekit-client'
import {
  applyScreenShareContentHintToTrack,
  nativeScreenShareAudioTrackConstraints,
} from '@/components/voice/voiceQuality'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function isLikelySafari(): boolean {
  if (typeof navigator === 'undefined') return false
  return /^((?!chrome|android).)*safari/i.test(navigator.userAgent)
}

// ─────────────────────────────────────────────────────────────────────────────
// Capture constraints
// ─────────────────────────────────────────────────────────────────────────────

// Techo razonable para no pedir 8K cuando el origen es menor.
// Chromium necesita ideal+max para no caer a 720p/30 por defecto.
const DISPLAY_CAPTURE_MAX_WIDTH     = 3840
const DISPLAY_CAPTURE_MAX_HEIGHT    = 2160
const DISPLAY_CAPTURE_MAX_FRAMERATE = 120

// Safari necesita constraints reducidos: a 60 fps con ideal+max colapsa el
// encoder en M-series y produce frames duplicados. 30 fps es su límite estable.
const SAFARI_MAX_FRAMERATE = 30

// ─────────────────────────────────────────────────────────────────────────────
// buildDisplayMediaStreamOptions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Traduce `ScreenShareCaptureOptions` (livekit-client) a `DisplayMediaStreamOptions`
 * que entiende el navegador directamente.
 *
 * Incluye campos que LiveKit no reenvía por sí solo, como
 * `suppressLocalAudioPlayback` dentro de `audio`.
 *
 * @remarks
 * No se usan `restrictOwnAudio` ni `windowAudio`: en builds reales combinados
 * con pestaña/ventana han dejado streams sin audio o capturas vacías
 * (comportamiento «best effort» según MDN). El usuario elige la fuente en el
 * diálogo del SO; `systemAudio: 'exclude'` en `voiceQuality` limita el peor
 * caso en pantalla completa.
 */
export function buildDisplayMediaStreamOptions(
  options: ScreenShareCaptureOptions,
): DisplayMediaStreamOptions {
  // ── Vídeo ──────────────────────────────────────────────────────────────────
  let videoConstraints: MediaTrackConstraints | boolean = options.video ?? true

  if (options.resolution && options.resolution.width > 0 && options.resolution.height > 0) {
    videoConstraints = typeof videoConstraints === 'boolean' ? {} : { ...(videoConstraints as object) }
    const v      = videoConstraints as MediaTrackConstraints
    const idealW  = options.resolution.width
    const idealH  = options.resolution.height
    const idealFr = options.resolution.frameRate ?? 60

    // Safari colapsa el encoder a ≥60 fps en hardware Apple Silicon; se fuerza
    // un techo de 30 fps para mantener estabilidad en esa plataforma.
    const maxFr = isLikelySafari() ? SAFARI_MAX_FRAMERATE : DISPLAY_CAPTURE_MAX_FRAMERATE

    // getDisplayMedia no admite `min` (ni muchas restricciones obligatorias): Chromium lanza
    // «min constraints are not supported». ideal+max bastan para guiar resolución y fps.
    Object.assign(v, {
      width:     { ideal: idealW,  max: DISPLAY_CAPTURE_MAX_WIDTH  },
      height:    { ideal: idealH,  max: DISPLAY_CAPTURE_MAX_HEIGHT },
      frameRate: { ideal: Math.min(idealFr, maxFr), max: maxFr },
    })
  }

  // ── Audio ──────────────────────────────────────────────────────────────────
  let audio: boolean | MediaTrackConstraints = options.audio ?? false

  if (typeof audio === 'object' && audio !== null) {
    const merged: Record<string, unknown> = { ...(audio as object) }
    // suppressLocalAudioPlayback no lo pasa LiveKit; lo inyectamos aquí para
    // evitar eco cuando el SO devuelve el audio de sistema al altavoz local.
    merged.suppressLocalAudioPlayback =
      typeof options.suppressLocalAudioPlayback === 'boolean'
        ? options.suppressLocalAudioPlayback
        : (merged.suppressLocalAudioPlayback ?? false)
    audio = merged as MediaTrackConstraints
  }

  // ── Resultado ──────────────────────────────────────────────────────────────
  const out: Record<string, unknown> = {
    audio,
    video:              videoConstraints,
    selfBrowserSurface: options.selfBrowserSurface,
    surfaceSwitching:   options.surfaceSwitching,
    systemAudio:        options.systemAudio,
    preferCurrentTab:   options.preferCurrentTab,
  }

  // controller es opcional y no debe enviarse como undefined al navegador
  if (options.controller != null) {
    out.controller = options.controller
  }

  return out as DisplayMediaStreamOptions
}

// ─────────────────────────────────────────────────────────────────────────────
// createLocalScreenShareTracks
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Solicita captura de pantalla al navegador vía `getDisplayMedia` y devuelve
 * las pistas resultantes como `LocalTrack[]` listas para `publishTrack`.
 *
 * - Siempre incluye la pista de vídeo con `contentHint` aplicado.
 * - Si el stream contiene audio (p. ej. audio de pestaña), lo incluye como
 *   `ScreenShareAudio` con las constraints de fidelidad del proyecto.
 *
 * @throws {DeviceUnsupportedError} Si `getDisplayMedia` no está disponible.
 * @throws {TrackInvalidError}      Si el stream no contiene pista de vídeo.
 */
export async function createLocalScreenShareTracks(
  options?: ScreenShareCaptureOptions,
): Promise<LocalTrack[]> {
  if (navigator.mediaDevices?.getDisplayMedia === undefined) {
    throw new DeviceUnsupportedError('getDisplayMedia not supported')
  }

  const opts   = options ?? {}
  const stream = await navigator.mediaDevices.getDisplayMedia(buildDisplayMediaStreamOptions(opts))

  // ── Vídeo ──────────────────────────────────────────────────────────────────
  const videoTracks = stream.getVideoTracks()
  if (videoTracks.length === 0) {
    throw new TrackInvalidError('no video track found')
  }

  applyScreenShareContentHintToTrack(videoTracks[0])
  const screenVideo        = new LocalVideoTrack(videoTracks[0], undefined, false)
  screenVideo.source       = Track.Source.ScreenShare
  const localTracks: LocalTrack[] = [screenVideo]

  // ── Audio (opcional, solo si el SO lo proporciona) ─────────────────────────
  const audioTracks = stream.getAudioTracks()
  if (audioTracks.length > 0) {
    const raw = audioTracks[0]
    // Aplicamos constraints de alta fidelidad (sin filtros de voz).
    // El fallo es no-crítico: la pista sigue siendo válida con sus constraints originales.
    raw.applyConstraints(nativeScreenShareAudioTrackConstraints).catch((err) => {
      console.warn('[screenShare] applyConstraints on audio track failed:', err)
    })
    const screenAudio  = new LocalAudioTrack(raw, nativeScreenShareAudioTrackConstraints, false)
    screenAudio.source = Track.Source.ScreenShareAudio
    localTracks.push(screenAudio)
  }

  return localTracks
}