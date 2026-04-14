import { describe, expect, it } from 'vitest'
import {
  cameraPublishOptions,
  roomOptionsHighQuality,
  screenSharePublishOptions,
} from '@/components/voice/voiceQuality'

describe('voiceQuality presets', () => {
  it('usa bitrate alto para cámara y pantalla', () => {
    expect(cameraPublishOptions.videoEncoding?.maxBitrate).toBeGreaterThanOrEqual(6_000_000)
    expect(screenSharePublishOptions.screenShareEncoding?.maxBitrate).toBeGreaterThanOrEqual(
      20_000_000,
    )
  })

  it('configura sala para priorizar calidad y resolución', () => {
    expect(roomOptionsHighQuality.dynacast).toBe(true)
    expect(roomOptionsHighQuality.adaptiveStream).toBe(true)
    expect(roomOptionsHighQuality.publishDefaults?.degradationPreference).toBe(
      'maintain-resolution',
    )
  })
})
