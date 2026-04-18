/**
 * Aislamiento de captura en Electron frente a `displaySurface: 'browser'` en la web.
 *
 * **Qué sí hace Chromium/Electron con una fuente `window:`**
 * - Vídeo: la ventana elegida.
 * - Audio vía `getUserMedia` + `chromeMediaSource: 'desktop'` y el **mismo** `chromeMediaSourceId`
 *   que el vídeo: el motor intenta asociar el loopback a esa superficie (similar a compartir una
 *   pestaña con audio de esa pestaña). No es una garantía formal de “solo ese proceso” en todos
 *   los drivers/dispositivos.
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
 * Este repositorio se queda en la ruta **Chromium + mismo sourceId** para ventana; la ruta nativa
 * queda documentada aquí para un módulo opcional futuro.
 */

export type ElectronDesktopCaptureKind = 'window' | 'screen'

/** Ventana: solo GUM+chromeMediaSourceId (misma fuente vídeo+audio). Pantalla: puede usarse displayMedia. */
export function useChromeDesktopMediaForKind(kind: ElectronDesktopCaptureKind): boolean {
  return kind === 'window'
}
