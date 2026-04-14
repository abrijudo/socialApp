import { fireEvent, render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { Track } from 'livekit-client'
import { VideoStage } from '@/components/voice/VideoStage'

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('hover: none'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
})

const useTracksMock = vi.fn()

vi.mock('@livekit/components-react', () => ({
  useTracks: (...args: unknown[]) => useTracksMock(...args),
  ParticipantTile: ({ trackRef }: { trackRef: { id: string } }) => (
    <div data-testid={`participant-tile-${trackRef.id}`} />
  ),
}))

describe('VideoStage', () => {
  it('renderiza una tarjeta por cada track simultáneo', () => {
    const audioTrackPubMap = new Map([
      [
        'audio-screen',
        {
          source: Track.Source.ScreenShareAudio,
          audioTrack: {
            setVolume: vi.fn(),
          },
        },
      ],
    ])
    useTracksMock.mockReturnValue([
      {
        id: 'camera-self',
        source: Track.Source.Camera,
        participant: { identity: 'self', audioTrackPublications: audioTrackPubMap },
      },
      {
        id: 'screen-self',
        source: Track.Source.ScreenShare,
        publication: { trackSid: 'screen-self-sid' },
        participant: { identity: 'self', audioTrackPublications: audioTrackPubMap },
      },
      {
        id: 'screen-other-user',
        source: Track.Source.ScreenShare,
        publication: { trackSid: 'screen-other-user-sid' },
        participant: { identity: 'otro', audioTrackPublications: audioTrackPubMap },
      },
    ])

    render(<VideoStage />)

    expect(screen.getByTestId('participant-tile-camera-self')).toBeInTheDocument()
    expect(screen.getByTestId('participant-tile-screen-self')).toBeInTheDocument()
    expect(screen.getByTestId('participant-tile-screen-other-user')).toBeInTheDocument()
    expect(screen.getAllByTitle('Pantalla completa')).toHaveLength(3)
    expect(screen.getAllByTitle('Volumen de transmisión')).toHaveLength(3)
  })

  it('no renderiza grid cuando no hay tracks', () => {
    useTracksMock.mockReturnValue([])

    const { container } = render(<VideoStage />)

    expect(container).toBeEmptyDOMElement()
  })

  it('ajusta volumen por transmisión individual', () => {
    const setVolumeScreen = vi.fn()
    const participant = {
      identity: 'streamer',
      audioTrackPublications: new Map([
        [
          'audio-screen',
          {
            source: Track.Source.ScreenShareAudio,
            audioTrack: { setVolume: setVolumeScreen },
          },
        ],
      ]),
    }

    useTracksMock.mockReturnValue([
      {
        id: 'screen-streamer',
        source: Track.Source.ScreenShare,
        publication: { trackSid: 'screen-streamer-sid' },
        participant,
      },
    ])

    render(<VideoStage />)
    const slider = screen.getByLabelText('Volumen de transmisión de streamer')
    fireEvent.change(slider, { target: { value: '0' } })

    expect(setVolumeScreen).toHaveBeenCalledWith(0)
  })
})
