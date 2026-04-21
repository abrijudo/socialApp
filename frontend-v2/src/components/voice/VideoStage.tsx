import { useEffect, useMemo, useRef, useState } from 'react'
import { ParticipantTile, useTracks } from '@livekit/components-react'
import { Track } from 'livekit-client'
import {
  EyeOff,
  Maximize2,
  MonitorPlay,
  Pin,
  PinOff,
  Volume2,
  VolumeX,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { isRenderableVideoTrackRef } from '@/components/voice/videoTrackFilters'

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

/** Columnas del escenario: 1 → una columna a todo el ancho; 2 → dos; 3+ → máx. 3 por fila. */
function stageColumnCount(trackCount: number): number {
  if (trackCount <= 1) return 1
  if (trackCount === 2) return 2
  return 3
}

/** Contenedor del tile: flex para centrar el vídeo manteniendo object-contain (nada recortado). */
const TILE_BASE =
  'group relative box-border flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden rounded-xl border border-white/12 bg-zinc-950 ring-1 ring-inset ring-white/5'

/**
 * Panel de vídeo: recuadros **mismo tamaño**, máx. **3 por fila**, grupo centrado (1 o 2 fuentes al
 * centro; con 3 en la primera fila). `onlySubscribed: false` evita tiles negros si aún no hay suscripción.
 */
export function VideoStage() {
  const rawTracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: false },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  )
  const tracks = useMemo(
    () => rawTracks.filter(isRenderableVideoTrackRef),
    [rawTracks],
  )
  const [volumesByTrack, setVolumesByTrack] = useState<Record<string, number>>({})
  /** Pantalla compartida: por defecto oculta (sin imagen ni audio) hasta que el usuario pulse «Ver transmisión». */
  const [screenViewingByKey, setScreenViewingByKey] = useState<Record<string, boolean>>({})
  const [isTouchDevice, setIsTouchDevice] = useState(false)
  const [pinnedTrackKey, setPinnedTrackKey] = useState<string | null>(null)
  const [controlsVisibleByTile, setControlsVisibleByTile] = useState<Record<string, boolean>>({})
  const lastNonZeroByTrackRef = useRef<Record<string, number>>({})
  const hideControlsTimerRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  const isControlsActiveOnAny = Object.values(controlsVisibleByTile).some((v) => v === true)
  const isImmersive = !isControlsActiveOnAny

  type StageTrack = (typeof tracks)[number]

  /**
   * Orden en la rejilla: transmisiones de pantalla primero, luego cámaras.
   * Si hay pin, ese tile va el primero para encontrarlo enseguida.
   */
  const gridTracks = useMemo(() => {
    const screens = tracks.filter(isScreenShare)
    const cams = tracks.filter((t) => !isScreenShare(t))
    let ordered: StageTrack[] = [...screens, ...cams]
    if (pinnedTrackKey) {
      const i = ordered.findIndex((t) => trackVolumeKey(t) === pinnedTrackKey)
      if (i > 0) {
        const [p] = ordered.splice(i, 1)
        ordered = [p, ...ordered]
      }
    }
    return ordered
  }, [tracks, pinnedTrackKey])

  const stageCols = stageColumnCount(gridTracks.length)

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
      const userVol = typeof volumesByTrack[key] === 'number' ? volumesByTrack[key] : 1
      const effective =
        isScreenShare(track) && screenViewingByKey[key] !== true ? 0 : userVol
      if (appliedVolumesRef.current[key] === effective) continue
      appliedVolumesRef.current[key] = effective
      applyVolumeToTransmission(track, effective)
    }
  }, [tracks, volumesByTrack, screenViewingByKey])

  useEffect(() => {
    if (!pinnedTrackKey) return
    const stillExists = tracks.some((track) => trackVolumeKey(track) === pinnedTrackKey)
    if (!stillExists) {
      setPinnedTrackKey(null)
    }
  }, [tracks, pinnedTrackKey])

  /** Si deja de verse una pantalla compartida que estaba fijada, quitamos el pin. */
  useEffect(() => {
    if (!pinnedTrackKey) return
    if (screenViewingByKey[pinnedTrackKey] !== true) {
      const pinnedIsScreen = tracks.some(
        (t) => trackVolumeKey(t) === pinnedTrackKey && isScreenShare(t),
      )
      if (pinnedIsScreen) setPinnedTrackKey(null)
    }
  }, [screenViewingByKey, pinnedTrackKey, tracks])

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

  const renderTile = (track: StageTrack, index: number) => {
    const volumeKey = trackVolumeKey(track)
    const volume = typeof volumesByTrack[volumeKey] === 'number' ? volumesByTrack[volumeKey] : 1
    const participantLabel = trackParticipantLabel(track)
    const key = `${trackKey(track, index)}:cell`
    const showControls = controlsVisibleByTile[key] === true
    const isPinned = pinnedTrackKey === volumeKey
    const screenFit = isScreenShare(track)
    const viewingScreen = screenFit && screenViewingByKey[volumeKey] === true
    const screenConcealed = screenFit && !viewingScreen
    const isMuted = volume <= 0.001

    const outerClass = `${TILE_BASE} ${isImmersive ? 'shadow-none' : 'shadow-md'}`

    // object-fit contain (nunca cover): evita "zoom" recortado que estropea nitidez en 1080p.
    const mediaFitClass =
      '[&_video]:box-border [&_video]:!object-contain [&_video]:object-center [&_video]:max-h-full [&_video]:max-w-full [&_canvas]:!object-contain [&_canvas]:object-center [&_canvas]:max-h-full [&_canvas]:max-w-full'

    const hideLkOverlayClass = showControls
      ? '[&_.lk-participant-metadata]:opacity-100 [&_.lk-participant-metadata]:transition-opacity [&_.lk-participant-metadata]:duration-200'
      : '[&_.lk-participant-metadata]:opacity-0 [&_.lk-participant-metadata]:pointer-events-none [&_.lk-participant-metadata]:transition-opacity [&_.lk-participant-metadata]:duration-200'

    const stopViewingScreen = () => {
      setScreenViewingByKey((prev) => ({ ...prev, [volumeKey]: false }))
      if (pinnedTrackKey === volumeKey) setPinnedTrackKey(null)
    }

    const mediaAreaClass =
      'lk-stage-media relative flex min-h-0 min-w-0 w-full flex-1 items-center justify-center'

    return (
      <div
        key={key}
        className={`${outerClass} ${hideLkOverlayClass} lk-stage-tile`}
        onMouseMove={() => {
          if (isTouchDevice) return
          if (screenConcealed) return
          showControlsFor(key, 900)
        }}
        onMouseLeave={() => {
          if (isTouchDevice) return
          hideControlsFor(key)
        }}
        onClick={(e) => {
          if (!isTouchDevice) return
          if ((e.target as HTMLElement).closest('button, input')) return
          if (screenConcealed) return
          showControlsFor(key, 3000)
        }}
      >
        {screenConcealed ? (
          <>
            {/* Vídeo sigue montado para retomar al instante; no se muestra. */}
            <div
              className={`pointer-events-none absolute inset-0 z-0 ${mediaAreaClass} [&_video]:invisible [&_canvas]:invisible`}
              aria-hidden
            >
              <ParticipantTile trackRef={track} />
            </div>
            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center overflow-y-auto bg-gradient-to-b from-zinc-950 via-zinc-900/95 to-black p-2 text-center sm:p-4">
              <div className="border-border/60 bg-background/40 max-h-full max-w-sm rounded-xl border px-3 py-4 shadow-xl backdrop-blur-sm sm:rounded-2xl sm:px-5 sm:py-6">
                <div className="bg-primary/15 mx-auto mb-2 flex size-10 items-center justify-center rounded-xl sm:mb-3 sm:size-14 sm:rounded-2xl">
                  <MonitorPlay className="text-primary size-5 sm:size-7" aria-hidden />
                </div>
                <p className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase sm:text-xs">
                  Transmisión de pantalla
                </p>
                <p className="mt-0.5 truncate text-sm font-semibold sm:mt-1 sm:text-base">{participantLabel}</p>
                <p className="text-muted-foreground mt-1 text-xs sm:mt-2 sm:text-sm">
                  Oculto hasta que actives la vista y el audio.
                </p>
                <Button
                  type="button"
                  size="sm"
                  className="mt-3 w-full sm:mt-5"
                  onClick={(e) => {
                    e.stopPropagation()
                    setScreenViewingByKey((prev) => ({ ...prev, [volumeKey]: true }))
                  }}
                  aria-label={`Ver transmisión de ${participantLabel}`}
                >
                  <MonitorPlay className="mr-2 size-4" aria-hidden />
                  Ver transmisión
                </Button>
              </div>
            </div>
          </>
        ) : (
          <div className={`${mediaAreaClass} ${mediaFitClass}`}>
            <ParticipantTile trackRef={track} />
          </div>
        )}

        {/* Dejar de ver: siempre visible mientras la transmisión está activa */}
        {screenFit && viewingScreen ? (
          <div className="absolute top-2 left-2 z-30">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="border-border/60 bg-background/90 text-foreground hover:bg-background h-8 gap-1.5 px-2.5 text-xs shadow-md backdrop-blur-sm"
              aria-label={`Dejar de ver la transmisión de ${participantLabel}`}
              title="Ocultar vídeo y audio; puedes volver a activarla con «Ver transmisión»"
              onClick={(e) => {
                e.stopPropagation()
                stopViewingScreen()
              }}
            >
              <EyeOff className="size-3.5" aria-hidden />
              Dejar de ver
            </Button>
          </div>
        ) : null}

        {/* Pin + pantalla completa */}
        {screenConcealed ? null : (
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
        )}

        {/* Barra inferior: nombre + volumen (no en transmisión oculta) */}
        {screenConcealed ? null : (
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
        )}
      </div>
    )
  }

  const padClass = isImmersive ? 'p-0' : 'p-2 sm:p-3'

  return (
    <div
      className={`lk-video-stage flex h-full min-h-0 w-full min-w-0 flex-1 overflow-hidden bg-black ${padClass}`}
      aria-label="Rejilla de vídeo"
    >
      {gridTracks.length === 1 ? (
        <div className="flex h-full min-h-0 w-full flex-1" role="list">
          {renderTile(gridTracks[0], 0)}
        </div>
      ) : (
        <div
          className="box-border grid h-full min-h-0 w-full min-w-0 flex-1 gap-2 overflow-hidden py-0.5"
          style={{
            gridTemplateColumns: `repeat(${stageCols}, minmax(0, 1fr))`,
            gridAutoRows: 'minmax(0, 1fr)',
          }}
          role="list"
        >
          {gridTracks.map((track, index) => renderTile(track, index))}
        </div>
      )}
    </div>
  )
}
