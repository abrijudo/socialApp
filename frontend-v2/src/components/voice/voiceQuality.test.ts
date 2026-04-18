import { describe, expect, it } from 'vitest'
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
      16_000_000,
    )
  })

  it('configura sala para priorizar calidad y estabilidad', () => {
    expect(roomOptionsHighQuality.dynacast).toBe(true)
    expect(roomOptionsHighQuality.adaptiveStream).toBe(true)
    expect(roomOptionsHighQuality.webAudioMix).toBe(false)
    expect(roomOptionsHighQuality.publishDefaults?.degradationPreference).toBe(
      'maintain-framerate',
    )
    expect(roomOptionsHighQuality.publishDefaults?.screenShareEncoding).toBeDefined()
    // Debe haber al menos una capa de respaldo para que los subscribers con
    // poco ancho de banda reciban una versión degradada en vez de cortarse.
    const layers = roomOptionsHighQuality.publishDefaults?.screenShareSimulcastLayers ?? []
    expect(layers.length).toBeGreaterThanOrEqual(1)
  })

  it('captura pantalla a resolución nativa con contentHint motion', () => {
    const resolution = screenShareCaptureOptions.resolution!
    expect(resolution.width).toBe(3840)
    expect(resolution.height).toBe(2160)
    expect(screenShareCaptureOptions.contentHint).toBe('motion')
  })

  it('excluye la superficie del propio navegador para evitar bucle al compartir pestaña', () => {
    expect(screenShareCaptureOptions.selfBrowserSurface).toBe('exclude')
  })

  it('usa VP9 para screen share con fallback a VP8', () => {
    expect(screenSharePublishOptions.videoCodec).toBe('vp9')
    expect(screenSharePublishOptions.backupCodec).toBeDefined()
  })
})
