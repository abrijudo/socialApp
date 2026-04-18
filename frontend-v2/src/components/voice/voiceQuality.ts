import type {
  RoomOptions,
  ScreenShareCaptureOptions,
  TrackPublishOptions,
  VideoCaptureOptions,
} from 'livekit-client'
import { AudioPresets, ScreenSharePresets } from 'livekit-client'

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
  // Audio del screen share blindado contra la fuga de voces de la sala:
  //   - `systemAudio: 'exclude'` → al compartir pantalla/ventana el navegador NO
  //     ofrece "audio del sistema", así que lo que sale por nuestros altavoces
  //     (la voz de los demás participantes que LiveKit reproduce en local) NO se
  //     vuelve a capturar y NO se republica al SFU. Sin esto, los demás se oirían
  //     a sí mismos cuando alguien transmite con altavoces puestos.
  //   - `selfBrowserSurface: 'exclude'` → impide elegir la propia pestaña de la
  //     app como fuente; aunque se pidiera "compartir audio de la pestaña" no
  //     habría forma de incluir los `<audio>` internos con las voces remotas.
  //   - `suppressLocalAudioPlayback: true` → cuando se comparte otra pestaña con
  //     audio (YouTube, juego en navegador, música), ese audio se transmite a la
  //     sala pero deja de sonar en local, evitando dobles reproducciones y
  //     cualquier camino indirecto de re-captura.
  // El campo `audio` se deja activo para soportar los casos legítimos
  // (compartir una pestaña concreta con sonido); las tres opciones de arriba
  // son las que garantizan que NUNCA se cuelen los micrófonos de la sala.
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
  suppressLocalAudioPlayback: true,
  resolution: {
    width: 3840,
    height: 2160,
    frameRate: 60,
  },
  contentHint: 'motion',
}

export const screenSharePublishOptions: TrackPublishOptions = {
  screenShareEncoding: {
    maxBitrate: 24_000_000,
    maxFramerate: 60,
    priority: 'high',
  },
  videoCodec: 'vp9',
  // Capa de respaldo a 720p15 para subscribers con poco ancho de banda.
  // Sin capas, si un participante no puede con el stream principal se queda
  // a negro; con esta capa el SFU puede degradarle antes de cortar.
  screenShareSimulcastLayers: [ScreenSharePresets.h720fps15],
  degradationPreference: 'balanced',
  backupCodec: { codec: 'vp8', encoding: { maxBitrate: 18_000_000, maxFramerate: 60 } },
  // Preset estéreo para el audio del screen share (YouTube, juegos, música).
  // El mic sigue yendo por `publishDefaults.audioPreset` (mono/high quality).
  audioPreset: AudioPresets.musicHighQualityStereo,
}

export const roomOptionsHighQuality: RoomOptions = {
  adaptiveStream: true,
  dynacast: true,
  // Enruta el audio por el altavoz multimedia (YouTube/Spotify) en vez del auricular del teléfono.
  webAudioMix: true,
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
