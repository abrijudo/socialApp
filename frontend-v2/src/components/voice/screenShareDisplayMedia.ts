import type { LocalTrack, ScreenShareCaptureOptions } from 'livekit-client'
import {
  DeviceUnsupportedError,
  LocalAudioTrack,
  LocalVideoTrack,
  Track,
  TrackInvalidError,
} from 'livekit-client'
import { nativeScreenShareAudioTrackConstraints } from '@/components/voice/voiceQuality'

function isLikelySafari(): boolean {
  if (typeof navigator === 'undefined') return false
  return /^((?!chrome|android).)*safari/i.test(navigator.userAgent)
}

/**
 * Opciones de `getDisplayMedia` alineadas con livekit-client, más campos que
 * LiveKit no reenvía (p. ej. `suppressLocalAudioPlayback` dentro de `audio`).
 *
 * No usamos `restrictOwnAudio` ni `windowAudio` aquí: en builds reales
 * combinados con pestaña/ventana han dejado **streams sin audio** o capturas
 * vacías (comportamiento documentado como «best effort» en MDN). El usuario
 * elige ventana/pestaña en el diálogo del SO; `systemAudio: 'exclude'` en
 * `voiceQuality` sigue limitando el peor caso en pantalla completa.
 */
export function buildDisplayMediaStreamOptions(options: ScreenShareCaptureOptions): DisplayMediaStreamOptions {
  let videoConstraints: MediaTrackConstraints | boolean = options.video ?? true
  if (options.resolution && options.resolution.width > 0 && options.resolution.height > 0) {
    videoConstraints = typeof videoConstraints === 'boolean' ? {} : { ...(videoConstraints as object) }
    const v = videoConstraints as MediaTrackConstraints
    if (isLikelySafari()) {
      Object.assign(v, {
        width: { max: options.resolution.width },
        height: { max: options.resolution.height },
        frameRate: options.resolution.frameRate,
      })
    } else {
      Object.assign(v, {
        width: { ideal: options.resolution.width },
        height: { ideal: options.resolution.height },
        frameRate: options.resolution.frameRate,
      })
    }
  }

  let audio: boolean | MediaTrackConstraints = options.audio ?? false
  if (typeof audio === 'object' && audio !== null) {
    const merged: Record<string, unknown> = { ...(audio as object) }
    if (typeof options.suppressLocalAudioPlayback === 'boolean') {
      merged.suppressLocalAudioPlayback = options.suppressLocalAudioPlayback
    } else if (merged.suppressLocalAudioPlayback === undefined) {
      merged.suppressLocalAudioPlayback = false
    }
    audio = merged as MediaTrackConstraints
  }

  const out: Record<string, unknown> = {
    audio,
    video: videoConstraints,
    selfBrowserSurface: options.selfBrowserSurface,
    surfaceSwitching: options.surfaceSwitching,
    systemAudio: options.systemAudio,
    preferCurrentTab: options.preferCurrentTab,
  }

  if (options.controller !== undefined && options.controller !== null) {
    out.controller = options.controller
  }

  return out as DisplayMediaStreamOptions
}

export async function createLocalScreenShareTracks(
  options?: ScreenShareCaptureOptions,
): Promise<LocalTrack[]> {
  if (navigator.mediaDevices?.getDisplayMedia === undefined) {
    throw new DeviceUnsupportedError('getDisplayMedia not supported')
  }
  const opts = options ?? {}
  const stream = await navigator.mediaDevices.getDisplayMedia(buildDisplayMediaStreamOptions(opts))

  const tracks = stream.getVideoTracks()
  if (tracks.length === 0) {
    throw new TrackInvalidError('no video track found')
  }
  const screenVideo = new LocalVideoTrack(tracks[0], undefined, false)
  screenVideo.source = Track.Source.ScreenShare
  const localTracks: LocalTrack[] = [screenVideo]
  if (stream.getAudioTracks().length > 0) {
    const raw = stream.getAudioTracks()[0]
    void raw.applyConstraints(nativeScreenShareAudioTrackConstraints).catch(() => {})
    const screenAudio = new LocalAudioTrack(raw, nativeScreenShareAudioTrackConstraints, false)
    screenAudio.source = Track.Source.ScreenShareAudio
    localTracks.push(screenAudio)
  }
  return localTracks
}
