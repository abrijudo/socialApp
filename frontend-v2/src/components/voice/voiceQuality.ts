import type {
  RoomOptions,
  ScreenShareCaptureOptions,
  TrackPublishOptions,
  VideoCaptureOptions,
} from 'livekit-client'
import { AudioPresets } from 'livekit-client'

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
  video: true,
  // Audio del sistema sin filtros de voz: estéreo crudo para que música/vídeo suene natural.
  audio: {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
    channelCount: 2,
    sampleRate: 48000,
    sampleSize: 16,
  },
  resolution: {
    width: 3840,
    height: 2160,
    frameRate: 30,
  },
  contentHint: 'detail',
}

export const screenSharePublishOptions: TrackPublishOptions = {
  screenShareEncoding: {
    maxBitrate: 20_000_000,
    maxFramerate: 30,
    priority: 'high',
  },
  videoCodec: 'vp9',
  // Sin simulcast para screen share: el receptor recibe siempre la capa máxima.
  screenShareSimulcastLayers: [],
  degradationPreference: 'maintain-resolution',
  // Fallback a VP8 si VP9 no está disponible (ej: Safari antiguo).
  backupCodec: { codec: 'vp8', encoding: { maxBitrate: 16_000_000, maxFramerate: 30 } },
}

export const roomOptionsHighQuality: RoomOptions = {
  adaptiveStream: true,
  dynacast: true,
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
    audioPreset: AudioPresets.musicHighQuality,
    dtx: false,
    red: true,
  },
}
