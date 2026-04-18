/**
 * Aislamiento de captura en Electron frente a `displaySurface: 'browser'` en la web.
 *
 * **Ventana (`window:`)**
 * - Vídeo: `getUserMedia` + `chromeMediaSource: 'desktop'` + `chromeMediaSourceId` (solo pista de vídeo).
 * - Audio (Windows x64): **WASAPI por PID** vía npm `application-loopback` en el proceso Main; no se usa
 *   el audio de escritorio de Chromium para ventanas.
 *
 * **Qué no puede hacer solo el renderer**
 * - Impedir por software que el mezclador del SO mezcle otras apps en el mismo endpoint, ni
 *   separar con certeza las voces de **esta** misma app (reproducción remota LiveKit) del audio
 *   compartido sin colaboración del SO o de un capturador nativo.
 *
 * **Windows — WASAPI / módulos nativos (si necesitáis garantías de estudio)**
 * - API: captura de **loopback de sesión o de proceso** con WASAPI (`IAudioClient`,
 *   `AUDCLNT_STREAMFLAGS_LOOPBACK`, y extensiones para aislar por PID/sesión según versión).
 * - Enfoques comunitarios a evaluar (rebuild nativo para la ABI de Electron, IPC de PCM o
 *   inyección a `MediaStreamTrack` vía WebAudio):
 *   - Paquete npm **electron-audio-loopback** (loopback de sistema en varias plataformas).
 *   - Proyecto **application-loopback** en GitHub (WerdoxDev/application-loopback): orientado a
 *     audio por aplicación en Windows mediante WASAPI.
 * - Arquitectura típica: proceso **Main** (Node + addon nativo) captura PCM filtrado → IPC →
 *   renderer construye `MediaStream` / `LocalAudioTrack` aparte del vídeo de `desktopCapturer`.
 *
 * Si no hay PID mapeado para una ventana, el audio de esa ventana no se publica (solo vídeo).
 */

export type ElectronDesktopCaptureKind = 'window' | 'screen'

/** Ventana: vídeo por GUM+chromeMediaSourceId; audio por WASAPI aparte. Pantalla: puede usarse displayMedia. */
export function useChromeDesktopMediaForKind(kind: ElectronDesktopCaptureKind): boolean {
  return kind === 'window'
}
