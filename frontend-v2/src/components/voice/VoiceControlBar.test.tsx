import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { Track } from 'livekit-client'
import { VoiceControlBar } from '@/components/voice/VoiceControlBar'

const setMicrophoneEnabled = vi.fn()
const setScreenShareEnabled = vi.fn()
const setCameraEnabled = vi.fn()
const unpublishTrack = vi.fn()
const publishTrack = vi.fn().mockResolvedValue(undefined)
const getTrackPublication = vi.fn()
const disconnect = vi.fn()
const setActiveVoiceChannelId = vi.fn()
const setLocalVoiceMuted = vi.fn()
const setLocalCameraEnabled = vi.fn()
const setLocalScreenShareEnabled = vi.fn()
const setLocalVoiceSpeaking = vi.fn()
const setNoiseFilterEnabled = vi.fn().mockResolvedValue(undefined)
const setProcessor = vi.fn().mockResolvedValue(undefined)
const createLocalScreenTracks = vi.fn()
const on = vi.fn()
const off = vi.fn()

const localParticipantMock = {
  setMicrophoneEnabled,
  setScreenShareEnabled,
  setCameraEnabled,
  unpublishTrack,
  publishTrack,
  getTrackPublication,
  on,
  off,
  isSpeaking: false,
}

vi.mock('livekit-client', async () => {
  const actual = await vi.importActual<typeof import('livekit-client')>('livekit-client')
  return {
    ...actual,
    createLocalScreenTracks: (...args: unknown[]) => createLocalScreenTracks(...args),
  }
})

vi.mock('@livekit/krisp-noise-filter', () => ({
  isKrispNoiseFilterSupported: () => true,
}))

vi.mock('@livekit/components-react/krisp', () => ({
  useKrispNoiseFilter: () => ({
    setNoiseFilterEnabled,
    isNoiseFilterEnabled: false,
    isNoiseFilterPending: false,
    processor: undefined,
  }),
}))

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
  useAppStore: (
    selector: (s: {
      setActiveVoiceChannelId: (id: string | null) => void
      setLocalVoiceMuted: (muted: boolean) => void
      setLocalCameraEnabled: (enabled: boolean) => void
      setLocalScreenShareEnabled: (enabled: boolean) => void
      setLocalVoiceSpeaking: (speaking: boolean) => void
    }) => unknown,
  ) =>
    selector({
      setActiveVoiceChannelId,
      setLocalVoiceMuted,
      setLocalCameraEnabled,
      setLocalScreenShareEnabled,
      setLocalVoiceSpeaking,
    }),
}))

describe('VoiceControlBar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getTrackPublication.mockImplementation((source: unknown) => {
      if (source === Track.Source.Microphone) {
        return {
          track: {
            mediaStreamTrack: {} as MediaStreamTrack,
            setProcessor,
          },
        }
      }
      return undefined
    })
    // Por defecto el navegador entrega tab capture (browser) sin audio leak.
    createLocalScreenTracks.mockResolvedValue([
      {
        kind: 'video',
        mediaStreamTrack: {
          getSettings: () => ({ displaySurface: 'browser' }),
        } as unknown as MediaStreamTrack,
        stop: vi.fn(),
      },
    ])
  })

  it('activa micrófono con perfil fuerte de cancelación de ruido', async () => {
    render(<VoiceControlBar />)
    fireEvent.click(screen.getByTitle('Micrófono'))

    expect(setMicrophoneEnabled).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        echoCancellation: true,
        noiseSuppression: false,
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

  it('activa compartir pantalla con bitrate alto y opciones anti-fuga de audio', async () => {
    render(<VoiceControlBar />)
    await act(async () => {
      fireEvent.click(screen.getByTitle('Compartir pantalla'))
    })

    await waitFor(() => {
      expect(createLocalScreenTracks).toHaveBeenCalledWith(
        expect.objectContaining({
          contentHint: 'motion',
          resolution: expect.objectContaining({ width: 3840, height: 2160 }),
          // Blindajes contra que las voces de los participantes (que LiveKit
          // reproduce en local) se cuelen en la transmisión vía system/tab audio.
          systemAudio: 'exclude',
          selfBrowserSurface: 'exclude',
          suppressLocalAudioPlayback: true,
        }),
      )
    })
    await waitFor(() => {
      expect(publishTrack).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          videoCodec: 'vp9',
          screenShareEncoding: expect.objectContaining({
            maxBitrate: 24_000_000,
            maxFramerate: 60,
          }),
        }),
      )
    })
    expect(setScreenShareEnabled).not.toHaveBeenCalled()
  })

  it('al compartir pantalla completa descarta cualquier audio que entregue el navegador', async () => {
    const audioStop = vi.fn()
    const videoStop = vi.fn()
    createLocalScreenTracks.mockResolvedValueOnce([
      {
        kind: 'video',
        mediaStreamTrack: {
          getSettings: () => ({ displaySurface: 'monitor' }),
        } as unknown as MediaStreamTrack,
        stop: videoStop,
      },
      { kind: 'audio', stop: audioStop },
    ])

    render(<VoiceControlBar />)
    await act(async () => {
      fireEvent.click(screen.getByTitle('Compartir pantalla'))
    })

    await waitFor(() => {
      expect(publishTrack).toHaveBeenCalledTimes(1)
    })
    expect(publishTrack).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'video' }),
      expect.anything(),
    )
    expect(audioStop).toHaveBeenCalled()
  })

  it('activa supresión de ruido IA con Krisp en micrófono local', async () => {
    render(<VoiceControlBar />)
    await act(async () => {
      fireEvent.click(screen.getByTitle('Supresión de ruido IA'))
    })

    expect(setNoiseFilterEnabled).toHaveBeenCalledWith(true)
  })

})
