import type { LocalTrack } from 'livekit-client'
import { LocalAudioTrack, LocalVideoTrack, Track, TrackInvalidError } from 'livekit-client'
import {
  type ElectronDesktopCaptureKind,
  useChromeDesktopMediaForKind,
} from '@/components/voice/electronCaptureIsolation'

export type { ElectronDesktopCaptureKind } from '@/components/voice/electronCaptureIsolation'

function localTracksFromScreenStream(stream: MediaStream, captureAudio: boolean): LocalTrack[] {
  const videoTracks = stream.getVideoTracks()
  if (videoTracks.length === 0) {
    stream.getTracks().forEach((t) => t.stop())
    throw new TrackInvalidError('no video track found')
  }
  const screenVideo = new LocalVideoTrack(videoTracks[0], undefined, false)
  screenVideo.source = Track.Source.ScreenShare
  const out: LocalTrack[] = [screenVideo]

  const audioTracks = stream.getAudioTracks()
  if (captureAudio && audioTracks.length > 0) {
    const screenAudio = new LocalAudioTrack(audioTracks[0], undefined, false)
    screenAudio.source = Track.Source.ScreenShareAudio
    out.push(screenAudio)
  } else {
    audioTracks.forEach((t) => t.stop())
  }
  return out
}

/**
 * Captura escritorio en Electron.
 *
 * - **Ventana (`kind === 'window'`)**: solo `getUserMedia` con `chromeMediaSource: 'desktop'` y el
 *   mismo `chromeMediaSourceId` en vídeo y audio — equivalente práctico a compartir “pestaña” con
 *   audio de esa superficie (ver `electronCaptureIsolation.ts`).
 * - **Pantalla**: primero `getDisplayMedia` + `setDisplayMediaRequestHandler` (audio `loopback` a
 *   nivel sistema si se pide); si falla, `getUserMedia` con el id de pantalla.
 */
export async function createLocalScreenShareTracksFromElectronSource(
  sourceId: string,
  opts: { captureAudio: boolean; kind: ElectronDesktopCaptureKind },
): Promise<LocalTrack[]> {
  const api = typeof window !== 'undefined' ? window.electronAPI : undefined
  const chromeOnly = useChromeDesktopMediaForKind(opts.kind)

  if (!chromeOnly && typeof api?.armDisplayMediaPick === 'function') {
    try {
      await api.armDisplayMediaPick({
        sourceId,
        wantLoopbackAudio: opts.captureAudio,
      })
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: opts.captureAudio
          ? ({
              suppressLocalAudioPlayback: true,
              echoCancellation: true,
            } as DisplayMediaStreamOptions['audio'])
          : false,
      })
      return localTracksFromScreenStream(stream, opts.captureAudio)
    } catch (e) {
      console.warn('[electron] getDisplayMedia (pantalla) falló; probando getUserMedia:', e)
    } finally {
      void api.cancelDisplayMediaPick?.()
    }
  }

  const stream = await getElectronDesktopUserMedia(sourceId, opts.captureAudio)
  return localTracksFromScreenStream(stream, opts.captureAudio)
}

async function getElectronDesktopUserMedia(sourceId: string, captureAudio: boolean): Promise<MediaStream> {
  const mandatory = {
    chromeMediaSource: 'desktop',
    chromeMediaSourceId: sourceId,
  }
  /** Chromium: intentar AEC / exclusión de eco local sobre loopback de escritorio (best-effort). */
  const desktopAudioChrome = {
    mandatory,
    optional: [
      { echoCancellation: true },
      { googEchoCancellation: true },
      { googDAEchoCancellation: true },
      { disableLocalEcho: true },
    ],
  } as const

  const buildConstraints = (withAudio: boolean): MediaStreamConstraints => ({
    audio: withAudio
      ? ({
          ...desktopAudioChrome,
        } as unknown as MediaTrackConstraints)
      : false,
    video: {
      mandatory,
    } as unknown as MediaTrackConstraints,
  })

  try {
    return await navigator.mediaDevices.getUserMedia(buildConstraints(captureAudio))
  } catch (first) {
    if (captureAudio) {
      return await navigator.mediaDevices.getUserMedia(buildConstraints(false))
    }
    throw first
  }
}
