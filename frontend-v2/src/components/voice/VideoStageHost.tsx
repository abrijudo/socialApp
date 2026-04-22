import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useTracks } from '@livekit/components-react'
import { Track } from 'livekit-client'
import { GripHorizontal, PanelBottom, X } from 'lucide-react'
import { VideoStage } from '@/components/voice/VideoStage'
import { isRenderableVideoTrackRef } from '@/components/voice/videoTrackFilters'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/store/useAppStore'
import { useMatchMedia } from '@/hooks/useMatchMedia'
import { cn } from '@/lib/utils'

const VIDEO_STAGE_HEIGHT_KEY = 'sc_video_stage_height'
const VIDEO_STAGE_MIN = 180
const DEFAULT_VIDEO_STAGE = 360
const VIDEO_STAGE_MAX_VH = 0.82

function loadStoredVideoHeight(): number {
  try {
    if (typeof localStorage === 'undefined') return DEFAULT_VIDEO_STAGE
    const raw = localStorage.getItem(VIDEO_STAGE_HEIGHT_KEY)
    const n = raw ? Number(raw) : NaN
    if (!Number.isFinite(n) || n < VIDEO_STAGE_MIN) return DEFAULT_VIDEO_STAGE
    return n
  } catch {
    return DEFAULT_VIDEO_STAGE
  }
}

function persistVideoHeight(h: number) {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(VIDEO_STAGE_HEIGHT_KEY, String(Math.round(h)))
  } catch {
    /* noop */
  }
}

export type VideoStageHostProps = {
  children: ReactNode
  /** `server_id` del canal de voz conectado (para PiP al cambiar de servidor o ir a DMs). */
  voiceChannelServerId?: string | null
}

/**
 * Vídeo bajo un único `LiveKitRoom` estable. PiP (`fixed`) fuera de la recorte del layout
 * cuando el usuario no está en el “contexto” del mismo servidor o está en DMs.
 */
export function VideoStageHost({
  children,
  voiceChannelServerId: voiceServerIdProp,
}: VideoStageHostProps) {
  const setVoiceRoomHasRenderableVideo = useAppStore((s) => s.setVoiceRoomHasRenderableVideo)
  const activeVoiceChannelId = useAppStore((s) => s.activeVoiceChannelId)
  const isVideoStageOpen = useAppStore((s) => s.isVideoStageOpen)
  const setIsVideoStageOpen = useAppStore((s) => s.setIsVideoStageOpen)
  const activeDmChannelId = useAppStore((s) => s.activeDmChannelId)
  const activeServerId = useAppStore((s) => s.activeServerId)
  const channels = useAppStore((s) => s.channels)

  const voiceChannelServerId = useMemo(() => {
    if (voiceServerIdProp != null) return voiceServerIdProp
    if (!activeVoiceChannelId) return null
    return channels.find((c) => c.id === activeVoiceChannelId)?.server_id ?? null
  }, [activeVoiceChannelId, channels, voiceServerIdProp])

  const videoTracksRaw = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: false },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  )
  const videoTracks = useMemo(
    () => videoTracksRaw.filter(isRenderableVideoTrackRef),
    [videoTracksRaw],
  )
  const hasAnyVideo = videoTracks.length > 0

  useEffect(() => {
    setVoiceRoomHasRenderableVideo(hasAnyVideo)
    return () => setVoiceRoomHasRenderableVideo(false)
  }, [hasAnyVideo, setVoiceRoomHasRenderableVideo])

  const inVoice = Boolean(activeVoiceChannelId)
  const split = inVoice && isVideoStageOpen
  const inDm = Boolean(activeDmChannelId)
  const inOtherServer =
    activeServerId != null &&
    voiceChannelServerId != null &&
    activeServerId !== voiceChannelServerId
  const atInbox = !activeServerId && !activeDmChannelId
  const isFloatingMode = inDm || inOtherServer || atInbox
  const mdUp = useMatchMedia('(min-width: 768px)')

  const [stageHeight, setStageHeight] = useState<number>(loadStoredVideoHeight)
  const dragStateRef = useRef<{
    startY: number
    startHeight: number
    maxHeight: number
    pointerId: number
  } | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const clamp = () => {
      const max = Math.max(VIDEO_STAGE_MIN, Math.round(window.innerHeight * VIDEO_STAGE_MAX_VH))
      setStageHeight((prev) => {
        const next = Math.min(Math.max(prev, VIDEO_STAGE_MIN), max)
        if (next !== prev) persistVideoHeight(next)
        return next
      })
    }
    clamp()
    window.addEventListener('resize', clamp)
    return () => window.removeEventListener('resize', clamp)
  }, [])

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return
      const target = e.currentTarget
      const maxHeight = Math.max(VIDEO_STAGE_MIN, Math.round(window.innerHeight * VIDEO_STAGE_MAX_VH))
      dragStateRef.current = { startY: e.clientY, startHeight: stageHeight, maxHeight, pointerId: e.pointerId }
      target.setPointerCapture(e.pointerId)
      e.preventDefault()
    },
    [stageHeight],
  )

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const state = dragStateRef.current
    if (!state || state.pointerId !== e.pointerId) return
    const delta = e.clientY - state.startY
    const next = Math.min(Math.max(state.startHeight + delta, VIDEO_STAGE_MIN), state.maxHeight)
    setStageHeight(next)
  }, [])

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const state = dragStateRef.current
    if (!state || state.pointerId !== e.pointerId) return
    dragStateRef.current = null
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* noop */
    }
    persistVideoHeight(stageHeight)
  }, [stageHeight])

  const handleHandleDoubleClick = useCallback(() => {
    const max = Math.max(VIDEO_STAGE_MIN, Math.round(window.innerHeight * VIDEO_STAGE_MAX_VH))
    const next = Math.min(DEFAULT_VIDEO_STAGE, max)
    setStageHeight(next)
    persistVideoHeight(next)
  }, [])

  useEffect(() => {
    if (!inVoice) return
    if (!hasAnyVideo && isVideoStageOpen) {
      setIsVideoStageOpen(false)
    }
  }, [hasAnyVideo, inVoice, isVideoStageOpen, setIsVideoStageOpen])

  const floatingBottomClass = !mdUp
    ? 'bottom-[max(1.5rem,calc(env(safe-area-inset-bottom,0px)+4.75rem))]'
    : 'bottom-6'

  return (
    <main
      className="bg-background flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
      aria-label="Voz y conversación"
    >
      {split ? (
        <>
          <div
            className={cn(
              'bg-background flex min-w-0 flex-col overflow-hidden',
              isFloatingMode
                ? cn(
                    'fixed right-6 z-[200] flex w-72 sm:w-80 max-h-[50vh] flex-col rounded-xl border border-border shadow-2xl',
                    floatingBottomClass,
                  )
                : 'relative flex w-full min-w-0 shrink-0 flex-col',
            )}
            style={!isFloatingMode ? { height: stageHeight } : undefined}
            data-voice-video-dock
          >
            {isFloatingMode ? (
              <div className="bg-muted/90 flex shrink-0 items-center justify-between border-b border-border px-3 py-1.5 backdrop-blur-sm">
                <span className="text-foreground text-xs font-semibold">Vídeo activo</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground hover:text-foreground size-6"
                  onClick={() => setIsVideoStageOpen(false)}
                >
                  <X className="size-4" aria-hidden />
                </Button>
              </div>
            ) : (
              <div className="border-border flex shrink-0 items-center justify-end gap-2 border-b px-2 py-1 sm:px-4">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground gap-1.5 text-xs"
                  onClick={() => setIsVideoStageOpen(false)}
                >
                  <PanelBottom className="size-3.5" aria-hidden /> Ocultar videos
                </Button>
              </div>
            )}

            <div
              className={cn(
                'min-w-0 flex-1',
                isFloatingMode ? 'flex h-48 flex-col bg-black' : 'flex min-h-0 min-w-0 flex-col p-2',
              )}
            >
              <VideoStage />
            </div>
          </div>

          {split && !isFloatingMode ? (
            <div
              role="separator"
              aria-orientation="horizontal"
              tabIndex={0}
              className="group border-border flex h-3 shrink-0 cursor-row-resize touch-none select-none items-center justify-center border-y bg-muted/30 transition-colors hover:bg-muted"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              onDoubleClick={handleHandleDoubleClick}
            >
              <GripHorizontal
                className="text-muted-foreground group-hover:text-foreground size-4"
                aria-hidden
              />
            </div>
          ) : null}
        </>
      ) : null}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{children}</div>
    </main>
  )
}
