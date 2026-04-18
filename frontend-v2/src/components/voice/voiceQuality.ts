import type {
  RoomOptions,
  ScreenShareCaptureOptions,
  TrackPublishOptions,
  VideoCaptureOptions,
} from 'livekit-client'
import { AudioPresets, ScreenSharePresets, Track } from 'livekit-client'

export const microphoneCaptureOptions: NonNullable<RoomOptions['audioCaptureDefaults']> = {
  // Anti-eco del navegador. Krisp se encarga del ruido, así que dejamos
  // NS/AGC activos solo como fallback cuando Krisp no carga (móvil, WASM fallido).
  echoCancellation: true,
  noiseSuppression: false,
  autoGainControl: true,
  voiceIsolation: true,
  channelCount: 1,
  sampleRate: 48000,
  sampleSize: 16,
  // Minimiza delay de captura del driver. Algunos navegadores (Chromium) lo
  // respetan y reducen ~40 ms de buffer en micros USB.
  latency: 0,
}

/** Cámara 1080p estable con bitrate alto para priorizar calidad + fluidez. */
export const cameraCaptureOptions: VideoCaptureOptions = {
  resolution: {
    width: 1920,
    height: 1080,
    frameRate: 30,
  },
  frameRate: 30,
}

export const cameraPublishOptions: TrackPublishOptions = {
  videoEncoding: {
    maxBitrate: 6_000_000,
    maxFramerate: 30,
    priority: 'high',
  },
  videoCodec: 'h264',
  simulcast: true,
  degradationPreference: 'maintain-framerate',
}

export const screenShareCaptureOptions: ScreenShareCaptureOptions = {
  video: true,
  // Audio del screen share:
  //   - `systemAudio: 'exclude'` → no ofrecer captura de «todo el audio del sistema»
  //     al compartir pantalla completa (reduce eco por altavoces).
  //   - `selfBrowserSurface: 'exclude'` → impide compartir la pestaña de esta app
  //     (evita bucle de vídeo/audio con la propia sesión). Mantener siempre activo.
  //   - `suppressLocalAudioPlayback: false` (recomendado): si es `true`, en
  //     algunos Chromium el audio de la transmisión se comporta mal o el
  //     capturador queda en un estado raro; se fusiona en `audio` vía
  //     `screenShareDisplayMedia.ts`.
  audio: {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
    channelCount: 2,
    sampleRate: 48000,
    sampleSize: 16,
  },
  systemAudio: 'exclude',
  selfBrowserSurface: 'exclude',
  surfaceSwitching: 'include',
  suppressLocalAudioPlayback: false,
  // 1080p60: el codificador mantiene fps real; 4K60 suele tirones aunque el bitrate sea alto.
  resolution: {
    width: 1920,
    height: 1080,
    frameRate: 60,
  },
  // Mejor legibilidad de UI/texto; el SFU sigue pudiendo degradar por capas.
  contentHint: 'detail',
}

export const screenSharePublishOptions: TrackPublishOptions = {
  screenShareEncoding: {
    // Alto pero sostenible con H.264 por hardware en la mayoría de GPUs.
    maxBitrate: 10_000_000,
    maxFramerate: 60,
    priority: 'high',
  },
  videoCodec: 'h264',
  // Capa de respaldo a 720p15 para subscribers con poco ancho de banda.
  // Sin capas, si un participante no puede con el stream principal se queda
  // a negro; con esta capa el SFU puede degradarle antes de cortar.
  screenShareSimulcastLayers: [ScreenSharePresets.h720fps15],
  degradationPreference: 'maintain-framerate',
  backupCodec: { codec: 'vp8', encoding: { maxBitrate: 4_000_000, maxFramerate: 30 } },
  // Preset estéreo para el audio del screen share (YouTube, juegos, música).
  // El mic sigue yendo por `publishDefaults.audioPreset` (mono/high quality).
  audioPreset: AudioPresets.musicHighQualityStereo,
}

/** Constraints en la MediaStreamTrack de audio de pantalla (evita AEC/NS/AGC tipo “voz”). */
export const nativeScreenShareAudioTrackConstraints: MediaTrackConstraints = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
  channelCount: 2,
}

/**
 * Publicación explícita del audio WASAPI / pantalla (no tratarlo como voz).
 * `AudioPresets.music` (~48 kbps) es bajo para juego/vídeo; usamos estéreo HQ (128 kbps).
 */
export const electronNativeScreenAudioPublishOptions: TrackPublishOptions = {
  name: 'screen_audio',
  source: Track.Source.ScreenShareAudio,
  audioPreset: AudioPresets.musicHighQualityStereo,
  dtx: false,
  red: true,
}

export const roomOptionsHighQuality: RoomOptions = {
  adaptiveStream: true,
  dynacast: true,
  // `false`: rutas `<audio>` nativas para que Chromium pueda correlacionar salida local
  // con captura de escritorio (AEC / supresión de loopback) en Electron. Con `true`,
  // Web Audio a veces evita ese camino y reintroduce voces remotas en el loopback.
  // Si el audio remoto degrada, valorar auriculares o volver a `true` solo en web.
  webAudioMix: false,
  audioCaptureDefaults: microphoneCaptureOptions,
  videoCaptureDefaults: cameraCaptureOptions,
  publishDefaults: {
    videoEncoding: cameraPublishOptions.videoEncoding,
    videoCodec: cameraPublishOptions.videoCodec,
    simulcast: cameraPublishOptions.simulcast,
    degradationPreference: cameraPublishOptions.degradationPreference,
    screenShareEncoding: screenSharePublishOptions.screenShareEncoding,
    screenShareSimulcastLayers: screenSharePublishOptions.screenShareSimulcastLayers,
    backupCodec: screenSharePublishOptions.backupCodec,
    // Mic mono de alta calidad (96 kbps). El screen share sobrescribe este
    // preset en su publish específico con `musicHighQualityStereo` (128 kbps).
    audioPreset: AudioPresets.musicHighQuality,
    dtx: false,
    red: true,
    stopMicTrackOnMute: false,
  },
}
