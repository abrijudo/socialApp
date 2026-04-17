import { useEffect, useMemo, useRef, useState } from 'react'
import { ParticipantTile, useTracks } from '@livekit/components-react'
import { Track } from 'livekit-client'
import { Maximize2, Pin, PinOff, Volume2, VolumeX } from 'lucide-react'

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

function isScreenShare(track: unknown): boolean {
  return (track as { source?: string | number }).source === Track.Source.ScreenShare
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
 * Layout adaptativo para transmisiones simultáneas.
 *
 * Reglas:
 *  - Si hay un tile "pinned" (usuario ha fijado uno), va grande y el resto al
 *    filmstrip inferior.
 *  - Sin pin: 0 pantallas → galería de cámaras. 1 pantalla → la pantalla como
 *    hero + resto al filmstrip. 2+ pantallas → grid de pantallas + filmstrip
 *    de cámaras debajo.
 *
 * `onlySubscribed: false` evita "tiles negros" cuando la publicación existe
 * pero aún no hay suscripción remota en este cliente.
 */
export function VideoStage() {
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: false },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  )
  const [volumesByTrack, setVolumesByTrack] = useState<Record<string, number>>({})
  const [isTouchDevice, setIsTouchDevice] = useState(false)
  const [pinnedTrackKey, setPinnedTrackKey] = useState<string | null>(null)
  const [controlsVisibleByTile, setControlsVisibleByTile] = useState<Record<string, boolean>>({})
  const lastNonZeroByTrackRef = useRef<Record<string, number>>({})
  const hideControlsTimerRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  const screenShares = useMemo(() => tracks.filter(isScreenShare), [tracks])
  const cameras = useMemo(() => tracks.filter((t) => !isScreenShare(t)), [tracks])
  const hasScreenShare = screenShares.length > 0

  const isControlsActiveOnAny = Object.values(controlsVisibleByTile).some((v) => v === true)
  const isImmersive = !isControlsActiveOnAny

  type StageTrack = (typeof tracks)[number]

  // Resolución del pin: si el usuario pinchó un track que sigue vivo → hero forzado.
  const pinnedTrack: StageTrack | null = useMemo(() => {
    if (!pinnedTrackKey) return null
    return tracks.find((t) => trackVolumeKey(t) === pinnedTrackKey) ?? null
  }, [tracks, pinnedTrackKey])

  // Determina el layout sin pin: split (2+ screens) | hero+strip (1 screen) | galería.
  const layout: {
    mode: 'pinned' | 'split' | 'hero' | 'gallery'
    heroTracks: StageTrack[]
    stripTracks: StageTrack[]
  } = useMemo(() => {
    if (pinnedTrack) {
      const rest = tracks.filter((t) => trackVolumeKey(t) !== trackVolumeKey(pinnedTrack))
      return { mode: 'pinned', heroTracks: [pinnedTrack], stripTracks: rest }
    }
    if (screenShares.length >= 2) {
      return { mode: 'split', heroTracks: screenShares, stripTracks: cameras }
    }
    if (hasScreenShare) {
      return { mode: 'hero', heroTracks: [screenShares[0]], stripTracks: cameras }
    }
    return { mode: 'gallery', heroTracks: [], stripTracks: [] }
  }, [pinnedTrack, screenShares, cameras, hasScreenShare, tracks])

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

  const appliedVolumesRef = useRef<Record<string, number>>({})
  useEffect(() => {
    for (const track of tracks) {
      const key = trackVolumeKey(track)
      const volume = typeof volumesByTrack[key] === 'number' ? volumesByTrack[key] : 1
      if (appliedVolumesRef.current[key] === volume) continue
      appliedVolumesRef.current[key] = volume
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

  useEffect(() => {
    return () => {
      for (const timer of Object.values(hideControlsTimerRef.current)) {
        clearTimeout(timer)
      }
      hideControlsTimerRef.current = {}
    }
  }, [])

  if (tracks.length === 0) return null

  function showControlsFor(tileKey: string, durationMs: number) {
    setControlsVisibleByTile((prev) => (prev[tileKey] ? prev : { ...prev, [tileKey]: true }))
    const existing = hideControlsTimerRef.current[tileKey]
    if (existing) clearTimeout(existing)
    hideControlsTimerRef.current[tileKey] = setTimeout(() => {
      setControlsVisibleByTile((prev) => (prev[tileKey] ? { ...prev, [tileKey]: false } : prev))
    }, durationMs)
  }

  function hideControlsFor(tileKey: string) {
    const existing = hideControlsTimerRef.current[tileKey]
    if (existing) clearTimeout(existing)
    setControlsVisibleByTile((prev) => (prev[tileKey] ? { ...prev, [tileKey]: false } : prev))
  }

  const renderTile = (track: StageTrack, index: number, mode: 'hero' | 'strip' | 'grid') => {
    const volumeKey = trackVolumeKey(track)
    const volume = typeof volumesByTrack[volumeKey] === 'number' ? volumesByTrack[volumeKey] : 1
    const participantLabel = trackParticipantLabel(track)
    const isMuted = volume <= 0.001
    const key = `${trackKey(track, index)}:${mode}`
    const showControls = controlsVisibleByTile[key] === true
    const isPinned = pinnedTrackKey === volumeKey
    const outerClass =
      mode === 'hero'
        ? `group relative h-full min-h-0 w-full min-w-0 overflow-hidden bg-black ${
            isImmersive ? 'rounded-none border-0' : 'rounded-lg border border-border/20'
          }`
        : mode === 'strip'
          ? `group relative h-full w-56 shrink-0 overflow-hidden bg-black sm:w-64 ${
              isImmersive ? 'rounded-none border-0' : 'rounded-lg border border-border/20'
            }`
          : `group relative min-h-0 min-w-0 overflow-hidden bg-black ${
              isImmersive ? 'rounded-none border-0' : 'rounded-lg border border-border/20'
            }`
    const screenFit = isScreenShare(track)
    // `object-contain` para screen share (no recortar texto), `object-cover`
    // para cámaras en el filmstrip/grid (miniaturas limpias). En modo hero las
    // cámaras usan `object-contain` para no recortar caras si el aspect ratio
    // del viewport no coincide con el de la webcam.
    const shouldContain = screenFit || mode === 'hero'
    const mediaFitClass = shouldContain
      ? '[&_video]:h-full [&_video]:w-full [&_video]:object-contain [&_canvas]:h-full [&_canvas]:w-full [&_canvas]:object-contain'
      : '[&_video]:h-full [&_video]:w-full [&_video]:object-cover [&_canvas]:h-full [&_canvas]:w-full [&_canvas]:object-cover'

    const hideLkOverlayClass = showControls
      ? '[&_.lk-participant-metadata]:opacity-100 [&_.lk-participant-metadata]:transition-opacity [&_.lk-participant-metadata]:duration-200'
      : '[&_.lk-participant-metadata]:opacity-0 [&_.lk-participant-metadata]:pointer-events-none [&_.lk-participant-metadata]:transition-opacity [&_.lk-participant-metadata]:duration-200'

    return (
      <div
        key={key}
        className={`${outerClass} ${mediaFitClass} ${hideLkOverlayClass} lk-stage-tile`}
        onMouseMove={() => {
          if (isTouchDevice) return
          showControlsFor(key, 900)
        }}
        onMouseLeave={() => {
          if (isTouchDevice) return
          hideControlsFor(key)
        }}
        onClick={(e) => {
          if (!isTouchDevice) return
          if ((e.target as HTMLElement).closest('button, input')) return
          showControlsFor(key, 3000)
        }}
      >
        <ParticipantTile trackRef={track} />

        {/* Botones superiores derechos: pin + fullscreen */}
        <div
          className={`absolute top-2 right-2 z-20 flex items-center gap-1 transition-opacity duration-200 ${
            showControls ? 'opacity-100' : 'pointer-events-none opacity-0'
          }`}
        >
          <button
            type="button"
            className={`inline-flex h-8 w-8 items-center justify-center rounded-md border text-white ${
              isPinned
                ? 'border-primary bg-primary/80'
                : 'border-white/20 bg-black/60 hover:bg-black/80'
            }`}
            aria-label={isPinned ? 'Desfijar' : 'Fijar'}
            title={isPinned ? 'Desfijar' : 'Fijar como principal'}
            onClick={(e) => {
              e.stopPropagation()
              setPinnedTrackKey((prev) => (prev === volumeKey ? null : volumeKey))
            }}
          >
            {isPinned ? <PinOff className="size-4" aria-hidden /> : <Pin className="size-4" aria-hidden />}
          </button>
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/20 bg-black/60 text-white hover:bg-black/80"
            aria-label="Pantalla completa"
            title="Pantalla completa"
            onClick={(e) => {
              e.stopPropagation()
              const container = e.currentTarget.closest('.lk-stage-tile') as HTMLDivElement | null
              void requestTileFullscreen(container)
            }}
          >
            <Maximize2 className="size-4" aria-hidden />
          </button>
        </div>

        {/* Barra inferior: nombre + volumen */}
        <div
          className={`absolute right-2 bottom-2 left-2 z-20 flex items-center gap-1.5 rounded-md border border-white/20 bg-black/65 px-2 py-1 text-white transition-opacity duration-200 ${
            showControls ? 'opacity-100' : 'pointer-events-none opacity-0'
          }`}
        >
          <span className="min-w-0 flex-1 truncate text-xs opacity-80">{participantLabel}</span>
          <button
            type="button"
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-sm"
            aria-label={
              isMuted
                ? `Activar audio de ${participantLabel}`
                : `Mutear audio de ${participantLabel}`
            }
            title={isMuted ? 'Activar audio' : 'Mutear audio'}
            onClick={(e) => {
              e.stopPropagation()
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
              e.stopPropagation()
              const next = Number(e.target.value) / 100
              if (next > 0.001) lastNonZeroByTrackRef.current[volumeKey] = next
              setVolumesByTrack((prev) => ({ ...prev, [volumeKey]: next }))
            }}
            onPointerDown={(e) => e.stopPropagation()}
            aria-label={`Volumen de transmisión de ${participantLabel}`}
            title="Volumen de transmisión"
            className="h-1.5 w-24 accent-primary"
          />
        </div>
      </div>
    )
  }

  // ── Layouts ────────────────────────────────────────────────────────────────
  const padClass = isImmersive ? 'p-0' : 'p-2'
  const gapClass = isImmersive ? 'gap-0' : 'gap-2'

  if (layout.mode === 'gallery') {
    // Grid responsive 1/2/3/4 columnas. `auto-rows-fr` reparte filas iguales.
    const n = cameras.length
    // Para n pequeño (1–4) forzamos un grid cuadrado para no dejar tiles muy anchas.
    const gridCols =
      n === 1
        ? 'grid-cols-1'
        : n === 2
          ? 'grid-cols-1 sm:grid-cols-2'
          : n <= 4
            ? 'grid-cols-1 sm:grid-cols-2'
            : 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4'
    return (
      <div className={`flex h-full min-h-0 w-full flex-1 overflow-hidden bg-black ${padClass}`}>
        <div
          className={`grid h-full min-h-0 w-full min-w-0 auto-rows-fr ${gridCols} ${gapClass}`}
        >
          {cameras.map((track, index) => renderTile(track, index, 'grid'))}
        </div>
      </div>
    )
  }

  if (layout.mode === 'split') {
    // 2+ pantallas simultáneas: grid equitativo arriba + strip de cámaras debajo.
    const screens = layout.heroTracks
    const strip = layout.stripTracks
    const screenCols =
      screens.length === 2
        ? 'grid-cols-1 md:grid-cols-2'
        : screens.length === 3
          ? 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3'
          : 'grid-cols-1 md:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-3'
    return (
      <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden bg-black">
        <div className={`min-h-0 flex-1 ${padClass}`}>
          <div className={`grid h-full min-h-0 w-full min-w-0 auto-rows-fr ${screenCols} ${gapClass}`}>
            {screens.map((track, i) => renderTile(track, i, 'hero'))}
          </div>
        </div>
        {strip.length > 0 ? (
          <div
            className={`bg-background/50 shrink-0 overflow-x-auto transition-all duration-200 ${
              isImmersive ? 'h-0 overflow-hidden p-0 opacity-0' : 'h-40 p-2 opacity-100'
            }`}
          >
            <div className="flex h-full min-w-max gap-2">
              {strip.map((track, index) => renderTile(track, index, 'strip'))}
            </div>
          </div>
        ) : null}
      </div>
    )
  }

  // hero | pinned: 1 tile grande + strip con el resto.
  const heroTrack = layout.heroTracks[0]
  const strip = layout.stripTracks
  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden bg-black">
      <div className={`min-h-0 flex-1 ${padClass}`}>{renderTile(heroTrack, 0, 'hero')}</div>
      {strip.length > 0 ? (
        <div
          className={`bg-background/50 shrink-0 overflow-x-auto transition-all duration-200 ${
            isImmersive ? 'h-0 overflow-hidden p-0 opacity-0' : 'h-40 p-2 opacity-100'
          }`}
        >
          <div className="flex h-full min-w-max gap-2">
            {strip.map((track, index) => renderTile(track, index + 1, 'strip'))}
          </div>
        </div>
      ) : null}
    </div>
  )
}
