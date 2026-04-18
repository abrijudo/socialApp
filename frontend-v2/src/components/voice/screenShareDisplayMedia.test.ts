import { describe, expect, it, vi, afterEach } from 'vitest'
import { screenShareCaptureOptions } from '@/components/voice/voiceQuality'
import { buildDisplayMediaStreamOptions } from '@/components/voice/screenShareDisplayMedia'

describe('buildDisplayMediaStreamOptions', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('fusiona suppressLocalAudioPlayback en el objeto audio', () => {
    vi.stubGlobal('navigator', {
      mediaDevices: {
        getSupportedConstraints: () => ({}),
      },
    })
    const opts = buildDisplayMediaStreamOptions(screenShareCaptureOptions)
    expect(opts.audio).toMatchObject({
      channelCount: 2,
      suppressLocalAudioPlayback: false,
    })
    expect(opts).not.toHaveProperty('windowAudio')
    expect(opts).not.toHaveProperty('restrictOwnAudio')
  })
})
