import type {
  RoomOptions,
  ScreenShareCaptureOptions,
  TrackPublishOptions,
  VideoCaptureOptions,
} from 'livekit-client'
import { AudioPresets, Track } from 'livekit-client'

export const microphoneCaptureOptions: NonNullable<RoomOptions['audioCaptureDefaults']> = {
  echoCancellation: true,
  noiseSuppression: false,
  autoGainControl: true,
  voiceIsolation: true,
  channelCount: 1,
  sampleRate: 48000,
  sampleSize: 16,
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
  resolution: {
    width: 1920,
    height: 1080,
    frameRate: 60,
  },
  // 'detail' es ideal para mantener la calidad en vídeos e interfaces.
  contentHint: 'detail',
}

/** Configuración MASTER de Cine (AV1 + VP9 Fallback) */
export const screenSharePublishOptions: TrackPublishOptions = {
  // Tu SDK admite vp8. Sigue siendo excelente para mantener texto nítido.
  videoCodec: 'vp8', 
  screenShareEncoding: {
    maxBitrate: 8_000_000, 
    maxFramerate: 60,
    priority: 'high',
  },
  degradationPreference: 'maintain-resolution', 
  screenShareSimulcastLayers: [], 
  // Fallback a h264 para máxima compatibilidad con móviles antiguos
  backupCodec: { 
    codec: 'h264', 
    encoding: { maxBitrate: 4_000_000, maxFramerate: 30 } 
  },
  audioPreset: AudioPresets.musicHighQualityStereo,
}

export const nativeScreenShareAudioTrackConstraints: MediaTrackConstraints = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
  channelCount: 2,
}

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
    backupCodec: screenSharePublishOptions.backupCodec, // Ahora esto ya no dará error
    
    audioPreset: AudioPresets.musicHighQuality,
    dtx: false,
    red: true,
    stopMicTrackOnMute: false,
  },
}