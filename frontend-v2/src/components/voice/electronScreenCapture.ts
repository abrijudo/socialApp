import type { LocalTrack } from 'livekit-client'
import { LocalAudioTrack, LocalVideoTrack, Track, TrackInvalidError } from 'livekit-client'
import {
  type ElectronDesktopCaptureKind,
  useChromeDesktopMediaForKind,
} from '@/components/voice/electronCaptureIsolation'
import { createWasapiAppLoopbackMediaStreamTrack } from '@/components/voice/electronWasapiPcmToMediaTrack'
import { buildDisplayMediaStreamOptions } from '@/components/voice/screenShareDisplayMedia'
import {
  applyScreenShareContentHintToTrack,
  electronChromeDesktopVideoMandatory,
  nativeScreenShareAudioTrackConstraints,
  screenShareCaptureOptions,
} from '@/components/voice/voiceQuality'

export type { ElectronDesktopCaptureKind } from '@/components/voice/electronCaptureIsolation'

export type ElectronScreenCaptureResult = {
  tracks: LocalTrack[]
  /** Solo ventana + WASAPI: detener binario y cerrar pista sintética */
  disposeWasapi?: () => Promise<void>
}

function localTracksFromScreenStream(stream: MediaStream, captureAudio: boolean): LocalTrack[] {
  const videoTracks = stream.getVideoTracks()
  if (videoTracks.length === 0) {
    stream.getTracks().forEach((t) => t.stop())
    throw new TrackInvalidError('no video track found')
  }
  applyScreenShareContentHintToTrack(videoTracks[0])
  const screenVideo = new LocalVideoTrack(videoTracks[0], undefined, false)
  screenVideo.source = Track.Source.ScreenShare
  const out: LocalTrack[] = [screenVideo]

  const audioTracks = stream.getAudioTracks()
  if (captureAudio && audioTracks.length > 0) {
    const raw = audioTracks[0]
    void raw.applyConstraints(nativeScreenShareAudioTrackConstraints).catch(() => {})
    const screenAudio = new LocalAudioTrack(raw, nativeScreenShareAudioTrackConstraints, false)
    screenAudio.source = Track.Source.ScreenShareAudio
    out.push(screenAudio)
  } else {
    audioTracks.forEach((t) => t.stop())
  }
  return out
}

/**
 * - **Ventana + audio**: vídeo con `getUserMedia` (solo vídeo) + audio WASAPI por PID (`application-loopback`).
 *   Sin PID conocido → solo vídeo (no se usa audio de escritorio Chromium).
 * - **Pantalla + audio**: `getDisplayMedia` + handler; si falla, `getUserMedia` con vídeo+audio Chromium.
 */
export async function createLocalScreenShareTracksFromElectronSource(
  sourceId: string,
  opts: {
    captureAudio: boolean
    kind: ElectronDesktopCaptureKind
    /** PID Windows (ProcessList); requerido para audio de ventana sin loopback del sistema */
    processId?: string | null
  },
): Promise<ElectronScreenCaptureResult> {
  const api = typeof window !== 'undefined' ? window.electronAPI : undefined
  const chromeOnly = useChromeDesktopMediaForKind(opts.kind)
  /** PID Windows (trim); evita truthy con espacios */
  const processId = String(opts.processId ?? '').trim()

  const useWasapiWindowAudio =
    opts.kind === 'window' &&
    opts.captureAudio &&
    Boolean(processId) &&
    typeof api?.startAppLoopbackAudio === 'function'

  if (useWasapiWindowAudio && processId) {
    const videoStream = await getElectronDesktopUserMedia(sourceId, false)
    try {
      const videoTracks = videoStream.getVideoTracks()
      if (videoTracks.length === 0) {
        videoStream.getTracks().forEach((t) => t.stop())
        throw new TrackInvalidError('no video track found')
      }
      applyScreenShareContentHintToTrack(videoTracks[0])
      const screenVideo = new LocalVideoTrack(videoTracks[0], undefined, false)
      screenVideo.source = Track.Source.ScreenShare

      const { mediaStreamTrack, dispose } = await createWasapiAppLoopbackMediaStreamTrack(processId)
      void mediaStreamTrack.applyConstraints(nativeScreenShareAudioTrackConstraints).catch(() => {})
      const screenAudio = new LocalAudioTrack(
        mediaStreamTrack,
        nativeScreenShareAudioTrackConstraints,
        false,
      )
      screenAudio.source = Track.Source.ScreenShareAudio

      return {
        tracks: [screenVideo, screenAudio],
        disposeWasapi: dispose,
      }
    } catch (e) {
      videoStream.getTracks().forEach((t) => t.stop())
      throw e
    }
  }

  if (opts.kind === 'window' && opts.captureAudio && !processId) {
    console.warn(
      '[electron] Ventana con audio pero sin PID (ProcessList); se comparte solo vídeo para evitar loopback del sistema.',
    )
    const stream = await getElectronDesktopUserMedia(sourceId, false)
    const tracks = localTracksFromScreenStream(stream, false)
    return { tracks }
  }

  /** Sin WASAPI (p. ej. preload roto): nunca mezclar audio de Chromium para ventana — es loopback de sistema. */
  if (opts.kind === 'window' && opts.captureAudio && processId && typeof api?.startAppLoopbackAudio !== 'function') {
    console.warn(
      '[electron] Ventana con PID pero sin IPC WASAPI; solo vídeo. Comprueba preload / application-loopback.',
    )
    const stream = await getElectronDesktopUserMedia(sourceId, false)
    return { tracks: localTracksFromScreenStream(stream, false) }
  }

  if (!chromeOnly && typeof api?.armDisplayMediaPick === 'function') {
    try {
      await api.armDisplayMediaPick({
        sourceId,
        wantLoopbackAudio: opts.captureAudio,
      })
      const base = buildDisplayMediaStreamOptions(screenShareCaptureOptions) as DisplayMediaStreamOptions
      const stream = await navigator.mediaDevices.getDisplayMedia({
        ...base,
        video: base.video,
        audio: opts.captureAudio
          ? ({
              ...(typeof base.audio === 'object' && base.audio !== null ? base.audio : {}),
              suppressLocalAudioPlayback: true,
            } as DisplayMediaStreamOptions['audio'])
          : false,
      })
      return { tracks: localTracksFromScreenStream(stream, opts.captureAudio) }
    } catch (e) {
      console.warn('[electron] getDisplayMedia (pantalla) falló; probando getUserMedia:', e)
    } finally {
      void api.cancelDisplayMediaPick?.()
    }
  }

  /**
   * Para `window:`, el audio solo puede venir de WASAPI arriba. `getUserMedia`+audio aquí es loopback
   * del sistema en Windows (mezcla Brave, YouTube, etc.).
   */
  const gumAudio = opts.kind === 'window' ? false : opts.captureAudio
  const stream = await getElectronDesktopUserMedia(sourceId, gumAudio)
  const useStreamAudio = opts.kind === 'window' ? false : opts.captureAudio
  return { tracks: localTracksFromScreenStream(stream, useStreamAudio) }
}

async function getElectronDesktopUserMedia(sourceId: string, withAudio: boolean): Promise<MediaStream> {
  const mandatory = {
    chromeMediaSource: 'desktop',
    chromeMediaSourceId: sourceId,
    ...electronChromeDesktopVideoMandatory,
  }
  const buildConstraints = (audio: boolean): MediaStreamConstraints => ({
    audio: audio
      ? ({
          mandatory,
        } as unknown as MediaTrackConstraints)
      : false,
    video: {
      mandatory,
    } as unknown as MediaTrackConstraints,
  })

  try {
    return await navigator.mediaDevices.getUserMedia(buildConstraints(withAudio))
  } catch (first) {
    if (withAudio) {
      return await navigator.mediaDevices.getUserMedia(buildConstraints(false))
    }
    throw first
  }
}
