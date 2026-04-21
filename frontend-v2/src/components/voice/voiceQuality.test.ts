import { describe, expect, it } from 'vitest'
import {
  screenShareCaptureOptions,
  cameraPublishOptions,
  roomOptionsHighQuality,
  screenSharePublishOptions,
} from '@/components/voice/voiceQuality'

describe('voiceQuality presets', () => {
  it('usa bitrate alto para cámara y objetivo fijo para pantalla (VP9)', () => {
    expect(cameraPublishOptions.videoEncoding?.maxBitrate).toBeGreaterThanOrEqual(6_000_000)
    expect(screenSharePublishOptions.screenShareEncoding?.maxBitrate).toBe(5_000_000)
  })

  it('configura sala para priorizar calidad y estabilidad', () => {
    expect(roomOptionsHighQuality.dynacast).toBe(true)
    expect(roomOptionsHighQuality.adaptiveStream).toBe(true)
    expect(roomOptionsHighQuality.webAudioMix).toBe(false)
    expect(roomOptionsHighQuality.publishDefaults?.degradationPreference).toBe(
      'maintain-framerate',
    )
    expect(roomOptionsHighQuality.publishDefaults?.screenShareEncoding).toBeDefined()
    // Sin capas simulcast en screen share: una sola publicación para evitar
    // versiones borrosas; el SFU sigue usando adaptiveStream/dynacast.
    const layers = roomOptionsHighQuality.publishDefaults?.screenShareSimulcastLayers ?? []
    expect(layers.length).toBe(0)
  })

  it('captura pantalla 1080p60 fluida con contentHint detail', () => {
    const resolution = screenShareCaptureOptions.resolution!
    expect(resolution.width).toBe(1920)
    expect(resolution.height).toBe(1080)
    expect(screenShareCaptureOptions.contentHint).toBe('detail')
  })

  it('excluye la superficie del propio navegador para evitar bucle al compartir pestaña', () => {
    expect(screenShareCaptureOptions.selfBrowserSurface).toBe('exclude')
  })

  it('usa VP9 para screen share y prioriza resolución ante congestión', () => {
    expect(screenSharePublishOptions.videoCodec).toBe('vp9')
    expect(screenSharePublishOptions.degradationPreference).toBe('maintain-resolution')
    expect(screenSharePublishOptions.backupCodec).toBeUndefined()
  })
})
