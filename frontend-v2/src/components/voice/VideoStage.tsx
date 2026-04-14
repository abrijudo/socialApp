import { useEffect, useRef, useState } from 'react'
import { ParticipantTile, useTracks } from '@livekit/components-react'
import { Track } from 'livekit-client'
import { Maximize2, Volume2, VolumeX } from 'lucide-react'

function trackKey(track: unknown, index: number): string {
  const t = track as {
    participant?: { identity?: string }
    source?: string | number
    publication?: { trackSid?: string; sid?: string }
  }
  const participant = t.participant?.identity || 'unknown'
  const source = String(t.source ?? 'unknown')
  const sid = t.publication?.trackSid || t.publication?.sid || 'no-sid'
  return `${participant}:${source}:${sid}:${index}`
}

function trackVolumeKey(track: unknown): string {
  const t = track as {
    participant?: { identity?: string }
    source?: string | number
    publication?: { trackSid?: string; sid?: string }
  }
  const participant = t.participant?.identity || 'unknown'
  const source = String(t.source ?? 'unknown')
  const sid = t.publication?.trackSid || t.publication?.sid || 'no-sid'
  return `${participant}:${source}:${sid}`
}

function trackParticipantLabel(track: unknown): string {
  const t = track as { participant?: { identity?: string } }
  return t.participant?.identity || 'usuario'
}

function applyVolumeToTransmission(track: unknown, nextVolume: number) {
  const t = track as {
    source?: string | number
    participant?: {
      audioTrackPublications?: unknown
    }
  }
  const audioPubs = t.participant?.audioTrackPublications
  if (!(audioPubs instanceof Map)) return

  const source = t.source
  const wantsScreenAudio = source === Track.Source.ScreenShare
  const wantedSource = wantsScreenAudio ? Track.Source.ScreenShareAudio : Track.Source.Microphone
  let changedAny = false

  for (const pub of audioPubs.values()) {
    const p = pub as {
      source?: string | number
      audioTrack?: { setVolume?: (v: number) => void }
    }
    const audioTrack = p.audioTrack
    if (!audioTrack || typeof audioTrack.setVolume !== 'function') continue
    if (p.source === wantedSource) {
      audioTrack.setVolume(nextVolume)
      changedAny = true
    }
  }

  // Fallback: si no hay fuente esperada, aplicamos a cualquier audio remoto del participante.
  if (!changedAny) {
    for (const pub of audioPubs.values()) {
      const p = pub as {
        audioTrack?: { setVolume?: (v: number) => void }
      }
      const audioTrack = p.audioTrack
      if (!audioTrack || typeof audioTrack.setVolume !== 'function') continue
      audioTrack.setVolume(nextVolume)
    }
  }
}

async function requestTileFullscreen(el: HTMLDivElement | null) {
  if (!el) return
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen()
      return
    }
    await el.requestFullscreen()
  } catch {
    // Ignorado: algunos navegadores bloquean fullscreen sin gesto válido.
  }
}

/**
 * Cuadrícula LiveKit: todas las cámaras (con placeholder al apagar) + pantallas compartidas.
 * `onlySubscribed: false` evita que el hook omita publicaciones aún sin track remoto suscrito.
 */
export function VideoStage() {
  const tracks = useTracks(
    [
      // Sin placeholder para evitar "tiles negros" falsos cuando la publicación existe
      // pero aún no hay suscripción visual en el cliente local.
      { source: Track.Source.Camera, withPlaceholder: false },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  )
  const [volumesByTrack, setVolumesByTrack] = useState<Record<string, number>>({})
  const [isTouchDevice, setIsTouchDevice] = useState(false)
  const [pinnedTrackKey, setPinnedTrackKey] = useState<string | null>(null)
  const lastNonZeroByTrackRef = useRef<Record<string, number>>({})
  const screenShares = tracks.filter((t) => t.source === Track.Source.ScreenShare)
  const cameras = tracks.filter((t) => t.source === Track.Source.Camera)
  const hasScreenShare = screenShares.length > 0
  const focusTracks = hasScreenShare ? [...screenShares, ...cameras] : []
  const heroScreen = hasScreenShare
    ? focusTracks.find((t) => trackVolumeKey(t) === pinnedTrackKey) || screenShares[0]
    : null
  const filmstripTracks = hasScreenShare
    ? focusTracks.filter((t) => trackVolumeKey(t) !== trackVolumeKey(heroScreen))
    : []
  type StageTrack = (typeof tracks)[number]

  useEffect(() => {
    if (typeof window === 'undefined') return
    const mql = window.matchMedia('(hover: none), (pointer: coarse)')
    const apply = () => setIsTouchDevice(mql.matches)
    apply()
    mql.addEventListener?.('change', apply)
    return () => {
      mql.removeEventListener?.('change', apply)
    }
  }, [])

  useEffect(() => {
    setVolumesByTrack((prev) => {
      const next: Record<string, number> = {}
      for (const track of tracks) {
        const key = trackVolumeKey(track)
        next[key] = typeof prev[key] === 'number' ? prev[key] : 1
      }

      const prevKeys = Object.keys(prev)
      const nextKeys = Object.keys(next)
      if (prevKeys.length !== nextKeys.length) return next

      for (const key of nextKeys) {
        if (prev[key] !== next[key]) return next
      }

      // Evita re-render infinito cuando useTracks devuelve nuevas referencias
      // pero el contenido efectivo de volúmenes no cambió.
      return prev
    })
  }, [tracks])

  useEffect(() => {
    for (const track of tracks) {
      const key = trackVolumeKey(track)
      const volume = typeof volumesByTrack[key] === 'number' ? volumesByTrack[key] : 1
      applyVolumeToTransmission(track, volume)
    }
  }, [tracks, volumesByTrack])

  useEffect(() => {
    if (!pinnedTrackKey) return
    const stillExists = tracks.some((track) => trackVolumeKey(track) === pinnedTrackKey)
    if (!stillExists) {
      setPinnedTrackKey(null)
    }
  }, [tracks, pinnedTrackKey])

  if (tracks.length === 0) return null

  const renderTile = (track: StageTrack, index: number, mode: 'hero' | 'strip' | 'grid') => {
    const volumeKey = trackVolumeKey(track)
    const volume = typeof volumesByTrack[volumeKey] === 'number' ? volumesByTrack[volumeKey] : 1
    const participantLabel = trackParticipantLabel(track)
    const isMuted = volume <= 0.001
    const key = `${trackKey(track, index)}:${mode}`
    const outerClass =
      mode === 'hero'
        ? 'group relative h-full min-h-0 w-full min-w-0 overflow-hidden rounded-lg border border-border/20 bg-black'
        : mode === 'strip'
          ? 'group relative h-full w-56 shrink-0 overflow-hidden rounded-lg border border-border/20 bg-black sm:w-64'
          : 'group relative min-h-0 min-w-0 overflow-hidden rounded-lg border border-border/20 bg-black'

    return (
      <div key={key} className={`${outerClass} lk-stage-tile`}>
        <ParticipantTile trackRef={track} />
        <button
          type="button"
          className={`absolute top-2 right-2 z-20 inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/20 bg-black/60 text-white transition-opacity ${
            isTouchDevice ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          }`}
          aria-label="Pantalla completa"
          title="Pantalla completa"
          onClick={(e) => {
            const container = e.currentTarget.closest('.lk-stage-tile') as HTMLDivElement | null
            const keyForPin = trackVolumeKey(track)
            if (document.fullscreenEnabled) {
              void requestTileFullscreen(container)
            } else {
              setPinnedTrackKey((prev) => (prev === keyForPin ? null : keyForPin))
            }
          }}
        >
          <Maximize2 className="size-4" aria-hidden />
        </button>

        <div
          className={`absolute right-2 bottom-2 left-2 z-20 flex items-center gap-1.5 rounded-md border border-white/20 bg-black/65 px-2 py-1 text-white transition-opacity ${
            isTouchDevice ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          }`}
        >
          <button
            type="button"
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-sm"
            aria-label={
              isMuted
                ? `Activar audio de ${participantLabel}`
                : `Mutear audio de ${participantLabel}`
            }
            title={isMuted ? 'Activar audio' : 'Mutear audio'}
            onClick={() => {
              if (isMuted) {
                const restored = Math.max(
                  0.05,
                  Math.min(1, lastNonZeroByTrackRef.current[volumeKey] || 1),
                )
                setVolumesByTrack((prev) => ({ ...prev, [volumeKey]: restored }))
                return
              }
              lastNonZeroByTrackRef.current[volumeKey] = volume
              setVolumesByTrack((prev) => ({ ...prev, [volumeKey]: 0 }))
            }}
          >
            {isMuted ? (
              <VolumeX className="size-4" aria-hidden />
            ) : (
              <Volume2 className="size-4" aria-hidden />
            )}
          </button>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={Math.round(volume * 100)}
            onChange={(e) => {
              const next = Number(e.target.value) / 100
              if (next > 0.001) lastNonZeroByTrackRef.current[volumeKey] = next
              setVolumesByTrack((prev) => ({ ...prev, [volumeKey]: next }))
            }}
            aria-label={`Volumen de transmisión de ${participantLabel}`}
            title="Volumen de transmisión"
            className="h-1.5 w-24 accent-primary"
          />
        </div>
      </div>
    )
  }

  if (hasScreenShare && heroScreen) {
    return (
      <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden bg-black">
        <div className="flex-1 min-h-0 p-2">
          {renderTile(heroScreen, 0, 'hero')}
        </div>
        {filmstripTracks.length > 0 ? (
          <div className="bg-background/50 h-40 shrink-0 overflow-x-auto p-2">
            <div className="flex h-full min-w-max gap-2">
              {filmstripTracks.map((track, index) => renderTile(track, index + 1, 'strip'))}
            </div>
          </div>
        ) : null}
      </div>
    )
  }

  const galleryTracks = cameras.length > 0 ? cameras : tracks

  return (
    <div className="flex h-full min-h-0 w-full flex-1 overflow-hidden bg-black p-2">
      <div className="grid h-full min-h-0 w-full min-w-0 auto-rows-fr grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {galleryTracks.map((track, index) => renderTile(track, index, 'grid'))}
      </div>
    </div>
  )
}
