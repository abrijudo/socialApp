import type {
  AudioCaptureOptions,
  RoomOptions,
  ScreenShareCaptureOptions,
  TrackPublishOptions,
  VideoCaptureOptions,
} from 'livekit-client'
import { AudioPresets, Track, VideoPresets } from 'livekit-client'

// ─────────────────────────────────────────────────────────────────────────────
// 🎙️  MICRÓFONO
// ─────────────────────────────────────────────────────────────────────────────
// Voz en tiempo real con máxima limpieza de señal.
// Si usas el plugin Krisp de LiveKit → pon noiseSuppression: false (Krisp ya lo gestiona).
// ─────────────────────────────────────────────────────────────────────────────
export const microphoneCaptureOptions: AudioCaptureOptions = {
  echoCancellation:  true,
  noiseSuppression:  false,   // false si usas Krisp para evitar doble procesado
  autoGainControl:   true,
  voiceIsolation:    true,
  channelCount:      1,
  sampleRate:        48_000,
  sampleSize:        16,
  latency:           0,
}

/** Restricción de micrófono para LiveKit; `null` usa el micrófono predeterminado del sistema. */
export function microphoneCaptureOptionsWithPreferredMic(
  preferredDeviceId: string | null,
): AudioCaptureOptions {
  const id = preferredDeviceId?.trim()
  if (!id) return microphoneCaptureOptions
  return { ...microphoneCaptureOptions, deviceId: id }
}

// ─────────────────────────────────────────────────────────────────────────────
// 📷  CÁMARA — 1080p / 30 fps
// ─────────────────────────────────────────────────────────────────────────────
// VP8 sigue siendo la opción más segura para webcam: compatibilidad universal,
// encoder rápido y latencia mínima. 3 Mbps es el techo real útil para 1080p30.
// ─────────────────────────────────────────────────────────────────────────────
export const cameraCaptureOptions: VideoCaptureOptions = {
  resolution: VideoPresets.h1080.resolution,
  frameRate:  30,
}

export const cameraPublishOptions: TrackPublishOptions = {
  videoEncoding: {
    maxBitrate:   3_000_000,  // 3 Mbps — sweet spot para webcam 1080p30
    maxFramerate: 30,
    priority:     'high',
  },
  videoCodec:            'vp8',               // máxima compatibilidad, encoder veloz
  simulcast:             true,                // capas 360p / 540p / 1080p automáticas
  degradationPreference: 'maintain-framerate', // al degradar, baja resolución, no fps
}

// ─────────────────────────────────────────────────────────────────────────────
// 🖥️  CAPTURA DE PANTALLA — 1080p / 60 fps (juegos, vídeo, movimiento rápido)
// ─────────────────────────────────────────────────────────────────────────────
// Audio del sistema sin ningún filtro (música, efectos de juego, sonido del SO).
// systemAudio: 'exclude' porque la pista de audio nativa se publica aparte
// (ver electronNativeScreenAudioPublishOptions), evitando el eco de loopback.
// ─────────────────────────────────────────────────────────────────────────────
export const screenShareCaptureOptions: ScreenShareCaptureOptions = {
  video: true,
  audio: {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl:  false,
    channelCount:     2,
    sampleRate:       48_000,
    sampleSize:       16,
  },
  systemAudio:                 'exclude',   // audio gestionado por la pista nativa de Electron
  selfBrowserSurface:          'exclude',
  surfaceSwitching:            'include',
  suppressLocalAudioPlayback:  false,
  resolution: {
    width:     1920,
    height:    1080,
    frameRate: 60,   // 60 fps estables — mucho mejor que intentar 120 fps e inestabilizarlo
  },
  contentHint: 'motion',                    // prioriza movimiento sobre nitidez de texto
}

// Restricciones de captura para Electron / Chrome (getDisplayMedia mandatory constraints).
// maxFrameRate: 60 estabiliza el encoder; valores superiores generan picos de CPU sin ganancia visible.
export const electronChromeDesktopVideoMandatory: Record<string, number> = {
  maxWidth:     3840,
  maxHeight:    2160,
  maxFrameRate: 60,
  minFrameRate: 24,
}

/** Aplica el contentHint de pantalla a la pista de vídeo nativa (MediaStreamTrack). */
export function applyScreenShareContentHintToTrack(videoTrack: MediaStreamTrack): void {
  const hint = screenShareCaptureOptions.contentHint
  if (!hint || typeof videoTrack?.contentHint === 'undefined') return
  try {
    videoTrack.contentHint = hint
  } catch {
    /* noop — algunos navegadores no soportan contentHint en modo read-only */
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 🎬  PUBLICACIÓN DE PANTALLA — VP9 + SVC L3T3_KEY
// ─────────────────────────────────────────────────────────────────────────────
// Arquitectura de capas escalables (Scalable Video Coding):
//
//   Capa espacial  ×3 → ~360p / ~720p / 1080p
//   Capa temporal  ×3 → ~15 fps / 30 fps / 60 fps
//
// Todo se codifica UNA SOLA VEZ. LiveKit elige la capa que encaja con la red
// de cada receptor. Quien tenga buena conexión recibe 1080p60; quien no, 720p30.
//
// 8 Mbps en VP9 ≈ 14–16 Mbps en H.264 a igual calidad visual.
// backupCodec VP8 actúa como fallback para navegadores sin soporte VP9+SVC.
// ─────────────────────────────────────────────────────────────────────────────
export const screenSharePublishOptions: TrackPublishOptions = {
  videoCodec: 'vp9',
  screenShareEncoding: {
    maxBitrate:   8_000_000,  // 8 Mbps VP9 — elimina banding en gradientes y fondos oscuros
    maxFramerate: 60,
    priority:     'high',
  },
  // 'balanced': al degradar por red, baja un poco resolución Y un poco fps a la vez.
  // 'maintain-resolution' hundiría los fps a 5–8 durante picos de acción en un juego.
  degradationPreference: 'balanced',
  scalabilityMode:       'L3T3_KEY',  // SVC real: 3 capas espaciales × 3 temporales
  backupCodec: {
    codec:    'vp8',
    encoding: { maxBitrate: 3_000_000, maxFramerate: 30 },
  },
  audioPreset: AudioPresets.musicHighQualityStereo,
}

// ─────────────────────────────────────────────────────────────────────────────
// 🔊  AUDIO NATIVO DE PANTALLA (Electron)
// ─────────────────────────────────────────────────────────────────────────────
// Captura el audio del sistema operativo a través de la API nativa de Electron,
// no de getDisplayMedia, lo que evita el eco de loopback y la latencia extra.
// ─────────────────────────────────────────────────────────────────────────────
export const nativeScreenShareAudioTrackConstraints: MediaTrackConstraints = {
  echoCancellation: false,  // sin filtros — queremos el audio limpio del SO
  noiseSuppression: false,
  autoGainControl:  false,
  channelCount:     2,      // estéreo
}

export const electronNativeScreenAudioPublishOptions: TrackPublishOptions = {
  name:        'screen_audio',
  source:      Track.Source.ScreenShareAudio,
  audioPreset: AudioPresets.musicHighQualityStereo,
  dtx:         false,  // NUNCA true para música/juegos — dtx corta el audio en silencios breves
  red:         true,   // FEC (Forward Error Correction): recupera paquetes perdidos sin retransmitir
}

// ─────────────────────────────────────────────────────────────────────────────
// 🏠  ROOM — configuración global de la sala
// ─────────────────────────────────────────────────────────────────────────────
// adaptiveStream  → cada suscriptor pide solo la resolución que cabe en su ventana
// dynacast        → LiveKit deja de enviar capas que nadie está viendo (ahorra CPU y ancho de banda)
// webAudioMix     → false para evitar latencia extra del mezclador Web Audio de LiveKit en Electron
// ─────────────────────────────────────────────────────────────────────────────
export const roomOptionsHighQuality: RoomOptions = {
  adaptiveStream: true,
  dynacast:       true,
  webAudioMix:    false,

  audioCaptureDefaults: microphoneCaptureOptions,
  videoCaptureDefaults: cameraCaptureOptions,

  publishDefaults: {
    // — cámara —
    videoEncoding:         cameraPublishOptions.videoEncoding,
    videoCodec:            cameraPublishOptions.videoCodec,
    simulcast:             cameraPublishOptions.simulcast,
    degradationPreference: cameraPublishOptions.degradationPreference,

    // — compartir pantalla —
    screenShareEncoding: screenSharePublishOptions.screenShareEncoding,
    backupCodec:         screenSharePublishOptions.backupCodec,
    scalabilityMode:     screenSharePublishOptions.scalabilityMode,

    // — audio —
    audioPreset:        AudioPresets.musicHighQuality,
    dtx:                false,
    red:                true,
    stopMicTrackOnMute: false,
  },
}