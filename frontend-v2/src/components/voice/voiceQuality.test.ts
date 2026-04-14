import { describe, expect, it } from 'vitest'
import { VideoPresets } from 'livekit-client'
import {
  screenShareCaptureOptions,
  cameraPublishOptions,
  roomOptionsHighQuality,
  screenSharePublishOptions,
} from '@/components/voice/voiceQuality'

describe('voiceQuality presets', () => {
  it('usa bitrate alto para cámara y pantalla', () => {
    expect(cameraPublishOptions.videoEncoding?.maxBitrate).toBeGreaterThanOrEqual(6_000_000)
    expect(screenSharePublishOptions.screenShareEncoding?.maxBitrate).toBeGreaterThanOrEqual(
      35_000_000,
    )
  })

  it('configura sala para priorizar calidad y fluidez', () => {
    expect(roomOptionsHighQuality.dynacast).toBe(true)
    expect(roomOptionsHighQuality.adaptiveStream).toBe(true)
    expect(roomOptionsHighQuality.publishDefaults?.degradationPreference).toBe(
      'maintain-framerate',
    )
  })

  it('usa preset de compartir pantalla 1080p a 60fps', () => {
    const resolution = screenShareCaptureOptions.resolution!
    expect(resolution.width).toBe(VideoPresets.h1080.resolution.width)
    expect(resolution.height).toBe(VideoPresets.h1080.resolution.height)
    expect((resolution as { frameRate?: number }).frameRate).toBe(60)
  })
})
