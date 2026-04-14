import type {
  RoomOptions,
  ScreenShareCaptureOptions,
  TrackPublishOptions,
  VideoCaptureOptions,
} from 'livekit-client'
import { AudioPresets, VideoPresets } from 'livekit-client'

export const microphoneCaptureOptions: NonNullable<RoomOptions['audioCaptureDefaults']> = {
  echoCancellation: true,
  noiseSuppression: false,
  autoGainControl: true,
  voiceIsolation: true,
  channelCount: 1,
  sampleRate: 48000,
  sampleSize: 16,
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
  /**
   * Modo amplio: no forzamos una superficie concreta para que el diálogo nativo
   * permita elegir pestaña, ventana (app) o pantalla completa según navegador/SO.
   */
  video: true,
  // Intentamos incluir audio del sistema cuando el navegador lo soporta.
  audio: true,
  resolution: {
    ...VideoPresets.h1080.resolution,
    frameRate: 60,
  },
  // Para escenas con movimiento (videos), priorizamos fluidez.
  contentHint: 'motion',
  // No forzamos preferCurrentTab para no sesgar la UI de selección hacia pestañas.
}

export const screenSharePublishOptions: TrackPublishOptions = {
  screenShareEncoding: {
    maxBitrate: 35_000_000,
    maxFramerate: 60,
    priority: 'high',
  },
  // En video en movimiento conviene conservar FPS para evitar borrosidad dinámica.
  degradationPreference: 'maintain-framerate',
}

export const roomOptionsHighQuality: RoomOptions = {
  adaptiveStream: true,
  dynacast: true,
  audioCaptureDefaults: microphoneCaptureOptions,
  videoCaptureDefaults: cameraCaptureOptions,
  publishDefaults: {
    ...cameraPublishOptions,
    ...screenSharePublishOptions,
    audioPreset: AudioPresets.musicHighQuality,
    dtx: false,
    red: true,
  },
}
