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
const createLocalScreenShareTracks = vi.fn()

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

vi.mock('@/components/voice/screenShareDisplayMedia', () => ({
  createLocalScreenShareTracks: (...args: unknown[]) => createLocalScreenShareTracks(...args),
}))

vi.mock('@livekit/krisp-noise-filter', () => ({
  isKrispNoiseFilterSupported: () => true,
}))

vi.mock('@livekit/components-react/krisp', () => ({
  useKrispNoiseFilter: () => ({
    setNoiseFilterEnabled,
    isNoiseFilterEnabled: false,
    isNoiseFilterPending: false,
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

function clickScreenShareButton(): void {
  fireEvent.click(screen.getByRole('button', { name: 'Compartir pantalla' }))
}

describe('VoiceControlBar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    unpublishTrack.mockResolvedValue(undefined)
    getTrackPublication.mockImplementation((source: unknown) => {
      if (source === Track.Source.Microphone) {
        return {
          track: {
            mediaStreamTrack: {} as MediaStreamTrack,
          },
        }
      }
      return undefined
    })
    createLocalScreenShareTracks.mockResolvedValue([
      {
        kind: 'video',
        source: Track.Source.ScreenShare,
        mediaStreamTrack: {
          getSettings: () => ({ displaySurface: 'browser' }),
        } as unknown as MediaStreamTrack,
        stop: vi.fn(),
      },
    ])
  })

  it('activa micrófono con perfil (Krisp: noiseSuppression off)', async () => {
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
        sampleRate: 48_000,
        sampleSize: 16,
        latency: 0,
      }),
    )
  })

  it('cuelga y limpia canal de voz activo', async () => {
    render(<VoiceControlBar />)
    fireEvent.click(screen.getByTitle('Colgar'))

    expect(disconnect).toHaveBeenCalled()
    expect(setActiveVoiceChannelId).toHaveBeenCalledWith(null)
  })

  it('activa cámara con preset de alta calidad (VP8 / ~3 Mbps)', async () => {
    render(<VoiceControlBar />)
    fireEvent.click(screen.getByTitle('Cámara'))

    expect(setCameraEnabled).toHaveBeenCalledWith(
      true,
      expect.objectContaining({
        frameRate: 30,
      }),
      expect.objectContaining({
        videoEncoding: expect.objectContaining({
          maxBitrate: 3_000_000,
          maxFramerate: 30,
        }),
        videoCodec: 'vp8',
        degradationPreference: 'maintain-framerate',
      }),
    )
  })

  it('activa compartir pantalla (web) con getDisplayMedia y publishTrack', async () => {
    render(<VoiceControlBar />)
    await act(async () => {
      clickScreenShareButton()
    })

    await waitFor(() => {
      expect(createLocalScreenShareTracks).toHaveBeenCalledWith(
        expect.objectContaining({
          contentHint: 'motion',
          resolution: expect.objectContaining({ width: 1920, height: 1080, frameRate: 60 }),
          systemAudio: 'exclude',
          selfBrowserSurface: 'exclude',
          suppressLocalAudioPlayback: false,
        }),
      )
    })
    await waitFor(() => {
      expect(publishTrack).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          videoCodec: 'vp9',
          screenShareEncoding: expect.objectContaining({
            maxBitrate: 8_000_000,
            maxFramerate: 60,
          }),
        }),
      )
    })
    expect(setScreenShareEnabled).not.toHaveBeenCalled()
  })

  it('al compartir (web) con vídeo y audio publica ambas pistas', async () => {
    const audioStop = vi.fn()
    createLocalScreenShareTracks.mockResolvedValueOnce([
      {
        kind: 'video',
        source: Track.Source.ScreenShare,
        mediaStreamTrack: {
          getSettings: () => ({ displaySurface: 'browser' }),
        } as unknown as MediaStreamTrack,
        stop: vi.fn(),
      },
      {
        kind: 'audio',
        source: Track.Source.ScreenShareAudio,
        mediaStreamTrack: {} as MediaStreamTrack,
        stop: audioStop,
      },
    ])

    render(<VoiceControlBar />)
    await act(async () => {
      clickScreenShareButton()
    })

    await waitFor(() => {
      expect(publishTrack).toHaveBeenCalledTimes(2)
    })
    expect(publishTrack).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      expect.objectContaining({
        name: 'screen_audio',
        dtx: false,
        red: true,
      }),
    )
    expect(audioStop).not.toHaveBeenCalled()
  })

  it('activa supresión de ruido IA con Krisp en micrófono local', async () => {
    render(<VoiceControlBar />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Activar supresión de ruido IA' }))
    })

    await waitFor(() => {
      expect(setNoiseFilterEnabled).toHaveBeenCalledWith(true)
    })
  })
})
