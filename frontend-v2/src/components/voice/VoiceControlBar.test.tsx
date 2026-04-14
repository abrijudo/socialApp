import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { VoiceControlBar } from '@/components/voice/VoiceControlBar'

const setMicrophoneEnabled = vi.fn()
const setScreenShareEnabled = vi.fn()
const setCameraEnabled = vi.fn()
const unpublishTrack = vi.fn()
const getTrackPublication = vi.fn()
const disconnect = vi.fn()
const setActiveVoiceChannelId = vi.fn()

const localParticipantMock = {
  setMicrophoneEnabled,
  setScreenShareEnabled,
  setCameraEnabled,
  unpublishTrack,
  getTrackPublication,
}

vi.mock('@livekit/components-react', () => ({
  useLocalParticipant: () => ({
    isMicrophoneEnabled: false,
    isCameraEnabled: false,
    isScreenShareEnabled: false,
    localParticipant: localParticipantMock,
  }),
  useRoomContext: () => ({ disconnect }),
}))

vi.mock('@/store/useAppStore', () => ({
  useAppStore: (selector: (s: { setActiveVoiceChannelId: (id: string | null) => void }) => unknown) =>
    selector({ setActiveVoiceChannelId }),
}))

describe('VoiceControlBar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('activa micrófono con perfil fuerte de cancelación de ruido', async () => {
    render(<VoiceControlBar />)
    fireEvent.click(screen.getByTitle('Micrófono'))

    expect(setMicrophoneEnabled).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        voiceIsolation: true,
        channelCount: 1,
      }),
    )
  })

  it('cuelga y limpia canal de voz activo', async () => {
    render(<VoiceControlBar />)
    fireEvent.click(screen.getByTitle('Colgar'))

    expect(disconnect).toHaveBeenCalled()
    expect(setActiveVoiceChannelId).toHaveBeenCalledWith(null)
  })

  it('activa cámara con preset de alta calidad/bitrate', async () => {
    render(<VoiceControlBar />)
    fireEvent.click(screen.getByTitle('Cámara'))

    expect(setCameraEnabled).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        frameRate: 30,
      }),
      expect.objectContaining({
        videoEncoding: expect.objectContaining({
          maxBitrate: 6_000_000,
          maxFramerate: 30,
        }),
        degradationPreference: 'maintain-framerate',
      }),
    )
  })

  it('activa compartir pantalla con bitrate alto', async () => {
    render(<VoiceControlBar />)
    fireEvent.click(screen.getByTitle('Compartir pantalla'))

    expect(setScreenShareEnabled).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        contentHint: 'text',
      }),
      expect.objectContaining({
        screenShareEncoding: expect.objectContaining({
          maxBitrate: 20_000_000,
          maxFramerate: 30,
        }),
      }),
    )
  })

})
