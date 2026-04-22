import { describe, expect, it } from 'vitest'
import {
  cameraCaptureOptions,
  cameraPublishOptions,
  electronChromeDesktopVideoMandatory,
  electronNativeScreenAudioPublishOptions,
  microphoneCaptureOptions,
  nativeScreenShareAudioTrackConstraints,
  roomOptionsHighQuality,
  screenShareCaptureOptions,
  screenSharePublishOptions,
} from '@/components/voice/voiceQuality'

describe('voiceQuality presets', () => {
  it('configura micrófono para voz: echoCancellation y Krisp (noiseSuppression off)', () => {
    expect(microphoneCaptureOptions).toEqual(
      expect.objectContaining({
        echoCancellation: true,
        noiseSuppression: false,
        autoGainControl: true,
        voiceIsolation: true,
        channelCount: 1,
        sampleRate: 48_000,
        sampleSize: 16,
        latency: 0,
      }),
    )
  })

  it('cámara: 1080p30; publicación VP8 simulcast ~3 Mbps', () => {
    expect(cameraCaptureOptions.frameRate).toBe(30)
    expect(cameraPublishOptions.videoEncoding?.maxBitrate).toBe(3_000_000)
    expect(cameraPublishOptions.videoEncoding?.maxFramerate).toBe(30)
    expect(cameraPublishOptions.videoCodec).toBe('vp8')
    expect(cameraPublishOptions.degradationPreference).toBe('maintain-framerate')
  })

  it('pantalla: captura 1080p60, contentHint motion; audio de sistema sin filtro (exclude loopback nativo)', () => {
    const res = screenShareCaptureOptions.resolution!
    expect(res.width).toBe(1920)
    expect(res.height).toBe(1080)
    expect(res.frameRate).toBe(60)
    expect(screenShareCaptureOptions.contentHint).toBe('motion')
    expect(screenShareCaptureOptions.systemAudio).toBe('exclude')
    expect(screenShareCaptureOptions.audio).toEqual(
      expect.objectContaining({
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 2,
        sampleRate: 48_000,
        sampleSize: 16,
      }),
    )
  })

  it('manda constraints Chrome/Electron para desktop (max 60 fps)', () => {
    expect(electronChromeDesktopVideoMandatory).toEqual({
      maxWidth: 3840,
      maxHeight: 2160,
      maxFrameRate: 60,
      minFrameRate: 24,
    })
  })

  it('pantalla: VP9+SVC, 8 Mbps, balanced; respaldo VP8', () => {
    expect(screenSharePublishOptions.videoCodec).toBe('vp9')
    expect(screenSharePublishOptions.degradationPreference).toBe('balanced')
    expect(screenSharePublishOptions.scalabilityMode).toBe('L3T3_KEY')
    expect(screenSharePublishOptions.screenShareEncoding).toEqual(
      expect.objectContaining({
        maxBitrate: 8_000_000,
        maxFramerate: 60,
        priority: 'high',
      }),
    )
    expect(screenSharePublishOptions.backupCodec).toEqual(
      expect.objectContaining({
        codec: 'vp8',
        encoding: expect.objectContaining({ maxBitrate: 3_000_000, maxFramerate: 30 }),
      }),
    )
  })

  it('audio nativo de pantalla (Electron) sin AGC/NS y publicación con red/FEC', () => {
    expect(nativeScreenShareAudioTrackConstraints).toEqual(
      expect.objectContaining({
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 2,
      }),
    )
    expect(electronNativeScreenAudioPublishOptions).toEqual(
      expect.objectContaining({
        name: 'screen_audio',
        dtx: false,
        red: true,
      }),
    )
  })

  it('sala: adaptiveStream, dynacast, webAudioMix off; publishDefaults alinean cámara y pantalla', () => {
    expect(roomOptionsHighQuality.dynacast).toBe(true)
    expect(roomOptionsHighQuality.adaptiveStream).toBe(true)
    expect(roomOptionsHighQuality.webAudioMix).toBe(false)
    expect(roomOptionsHighQuality.audioCaptureDefaults).toEqual(microphoneCaptureOptions)
    expect(roomOptionsHighQuality.videoCaptureDefaults).toEqual(cameraCaptureOptions)
    expect(roomOptionsHighQuality.publishDefaults?.degradationPreference).toBe('maintain-framerate')
    expect(roomOptionsHighQuality.publishDefaults?.screenShareEncoding).toBeDefined()
    const layers = roomOptionsHighQuality.publishDefaults?.screenShareSimulcastLayers ?? []
    expect(layers.length).toBe(0)
  })
})
