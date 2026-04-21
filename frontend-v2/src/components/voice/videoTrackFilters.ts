import type { TrackPublication } from 'livekit-client'
import { Track } from 'livekit-client'

/**
 * Incluye solo referencias con vídeo real (cámara o pantalla), sin recuadros vacíos cuando la
 * cámara está apagada o la publicación está silenciada / sin pista.
 */
export function isRenderableVideoTrackRef(trackRef: unknown): boolean {
  const t = trackRef as { source?: Track.Source; publication?: TrackPublication | null }
  const source = t.source
  if (source !== Track.Source.Camera && source !== Track.Source.ScreenShare) {
    return false
  }
  const pub = t.publication
  if (!pub) return false
  if (!pub.track) return false
  if (pub.isMuted) return false
  return true
}
