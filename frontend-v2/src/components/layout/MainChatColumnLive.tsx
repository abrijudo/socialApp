import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTracks } from '@livekit/components-react'
import { Track } from 'livekit-client'
import { GripHorizontal, PanelBottom, PanelTop } from 'lucide-react'
import { ChatArea } from '@/components/chat/ChatArea'
import { DmChatArea } from '@/components/chat/DmChatArea'
import { HomeMainEmpty } from '@/components/layout/HomeMainEmpty'
import { ChannelHeader } from '@/components/layout/MainChatColumn'
import { UserProfilePopup } from '@/components/modals/UserProfilePopup'
import { VideoStage } from '@/components/voice/VideoStage'
import { isRenderableVideoTrackRef } from '@/components/voice/videoTrackFilters'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/store/useAppStore'

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
  } catch { /* quota o privado, lo ignoramos */ }
}

/**
 * Main con escenario de vídeo opcional. Solo como hijo de LiveKitRoom.
 * Módulo separado para code-splitting (LiveKit fuera del bundle inicial).
 */
export function MainChatColumnLive() {
  const activeTextChannelId = useAppStore((s) => s.activeTextChannelId)
  const activeDmChannelId = useAppStore((s) => s.activeDmChannelId)
  const activeServerId = useAppStore((s) => s.activeServerId)
  const activeVoiceChannelId = useAppStore((s) => s.activeVoiceChannelId)
  const isVideoStageOpen = useAppStore((s) => s.isVideoStageOpen)
  const setIsVideoStageOpen = useAppStore((s) => s.setIsVideoStageOpen)
  const channels = useAppStore((s) => s.channels)
  const activeChannel = channels.find((c) => c.id === activeTextChannelId)
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

  const [profileUserId, setProfileUserId] = useState<string | null>(null)
  const split = Boolean(activeVoiceChannelId) && isVideoStageOpen
  const inVoice = Boolean(activeVoiceChannelId)

  // Altura del panel de vídeo, en píxeles, arrastrable por el usuario. Se
  // persiste en localStorage y se acota al montar para no dejarlo gigante si
  // cambia el tamaño de la ventana entre sesiones.
  const [stageHeight, setStageHeight] = useState<number>(loadStoredVideoHeight)
  const containerRef = useRef<HTMLElement>(null)
  const dragStateRef = useRef<{
    startY: number
    startHeight: number
    maxHeight: number
    pointerId: number
  } | null>(null)

  // Ajusta la altura al redimensionar la ventana (p. ej. usuario en 60vh y
  // luego reduce la ventana: sin esto el chat quedaría con 0 px).
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
      const maxHeight = Math.max(
        VIDEO_STAGE_MIN,
        Math.round(window.innerHeight * VIDEO_STAGE_MAX_VH),
      )
      dragStateRef.current = {
        startY: e.clientY,
        startHeight: stageHeight,
        maxHeight,
        pointerId: e.pointerId,
      }
      target.setPointerCapture(e.pointerId)
      e.preventDefault()
    },
    [stageHeight],
  )

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const state = dragStateRef.current
    if (!state || state.pointerId !== e.pointerId) return
    const delta = e.clientY - state.startY
    const next = Math.min(
      Math.max(state.startHeight + delta, VIDEO_STAGE_MIN),
      state.maxHeight,
    )
    setStageHeight(next)
  }, [])

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const state = dragStateRef.current
    if (!state || state.pointerId !== e.pointerId) return
    dragStateRef.current = null
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch { /* pointer ya liberado */ }
    persistVideoHeight(stageHeight)
  }, [stageHeight])

  // Doble clic en el handle: resetea a la altura por defecto.
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

  // DM con sesión de voz activa: el mismo layout que fuera de LiveKit (el DM
  // incluye cabecera y composer; no se usa el rail de canal de texto).
  if (activeDmChannelId) {
    return <DmChatArea dmChannelId={activeDmChannelId} />
  }

  // Inicio / DMs sin conversación abierta: no dejar el chat de texto vacío (“Sin canal”).
  if (!activeTextChannelId && !activeServerId) {
    return <HomeMainEmpty />
  }

  return (
    <main
      ref={containerRef}
      className="bg-background flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
      aria-label="Contenido principal"
    >
      <ChannelHeader activeChannel={activeChannel} />
      {inVoice && !isVideoStageOpen && hasAnyVideo ? (
        <div className="border-border flex shrink-0 items-center justify-end gap-2 border-b px-2 py-1.5 sm:px-4">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs"
            onClick={() => setIsVideoStageOpen(true)}
          >
            <PanelTop className="size-3.5" aria-hidden />
            Mostrar panel de vídeo
          </Button>
        </div>
      ) : null}
      {split ? (
        <>
          <div className="border-border flex shrink-0 items-center justify-end gap-2 border-b px-2 py-1 sm:px-4">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground gap-1.5 text-xs"
              onClick={() => setIsVideoStageOpen(false)}
            >
              <PanelBottom className="size-3.5" aria-hidden />
              Ocultar videos
            </Button>
          </div>
          <div
            className="w-full min-w-0 shrink-0 flex-col overflow-hidden p-2 flex"
            style={{ height: stageHeight }}
          >
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <VideoStage />
            </div>
          </div>
          {/* Handle para redimensionar el panel de vídeo. Captura pointer para
              funcionar bien con el ratón y con gestos táctiles. Doble clic
              resetea a la altura por defecto. */}
          <div
            role="separator"
            aria-orientation="horizontal"
            aria-label="Ajustar alto del panel de vídeo"
            aria-valuenow={stageHeight}
            aria-valuemin={VIDEO_STAGE_MIN}
            tabIndex={0}
            className="group border-border flex h-3 shrink-0 cursor-row-resize touch-none select-none items-center justify-center border-y bg-muted/30 transition-colors hover:bg-muted"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onDoubleClick={handleHandleDoubleClick}
            onKeyDown={(e) => {
              // Teclado: flechas arriba/abajo ajustan 24 px. Shift + flecha: 72 px.
              if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
              e.preventDefault()
              const step = e.shiftKey ? 72 : 24
              const direction = e.key === 'ArrowUp' ? -1 : 1
              const max = Math.max(
                VIDEO_STAGE_MIN,
                Math.round(window.innerHeight * VIDEO_STAGE_MAX_VH),
              )
              setStageHeight((prev) => {
                const next = Math.min(
                  Math.max(prev + direction * step, VIDEO_STAGE_MIN),
                  max,
                )
                persistVideoHeight(next)
                return next
              })
            }}
          >
            <GripHorizontal
              className="text-muted-foreground group-hover:text-foreground size-4"
              aria-hidden
            />
          </div>
          <div className="flex min-h-0 min-w-0 w-full flex-1 flex-col">
            <ChatArea channelId={activeTextChannelId} onAuthorClick={setProfileUserId} />
          </div>
        </>
      ) : (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <ChatArea channelId={activeTextChannelId} onAuthorClick={setProfileUserId} />
        </div>
      )}
      {profileUserId ? (
        <UserProfilePopup
          open
          onOpenChange={(open) => { if (!open) setProfileUserId(null) }}
          userId={profileUserId}
        />
      ) : null}
    </main>
  )
}
