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
    const activePub = { track: {}, isMuted: false, trackSid: 'x' }
    useTracksMock.mockReturnValue([
      {
        id: 'camera-self',
        source: Track.Source.Camera,
        publication: activePub,
        participant: { identity: 'self', audioTrackPublications: audioTrackPubMap },
      },
      {
        id: 'screen-self',
        source: Track.Source.ScreenShare,
        publication: { ...activePub, trackSid: 'screen-self-sid' },
        participant: { identity: 'self', audioTrackPublications: audioTrackPubMap },
      },
      {
        id: 'screen-other-user',
        source: Track.Source.ScreenShare,
        publication: { ...activePub, trackSid: 'screen-other-user-sid' },
        participant: { identity: 'otro', audioTrackPublications: audioTrackPubMap },
      },
    ])

    render(<VideoStage />)

    expect(screen.getByTestId('participant-tile-camera-self')).toBeInTheDocument()
    expect(screen.getByTestId('participant-tile-screen-self')).toBeInTheDocument()
    expect(screen.getByTestId('participant-tile-screen-other-user')).toBeInTheDocument()
    // Pantallas compartidas ocultas por defecto: sin controles de pantalla completa ni volumen hasta «Ver transmisión»
    expect(screen.getAllByTitle('Pantalla completa')).toHaveLength(1)
    expect(screen.getAllByTitle('Volumen de transmisión')).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: /ver transmisión/i })).toHaveLength(2)
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
        publication: { track: {}, isMuted: false, trackSid: 'screen-streamer-sid' },
        participant,
      },
    ])

    render(<VideoStage />)
    fireEvent.click(screen.getByRole('button', { name: /ver transmisión de streamer/i }))
    const slider = screen.getByLabelText('Volumen de transmisión de streamer')
    fireEvent.change(slider, { target: { value: '0' } })

    expect(setVolumeScreen).toHaveBeenCalledWith(0)
  })
})
