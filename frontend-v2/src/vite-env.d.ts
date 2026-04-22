/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** `f32` (defecto) o `s16` — formato PCM del binario application-loopback */
  readonly VITE_ELECTRON_WASAPI_PCM_FORMAT?: 'f32' | 's16'
  /** URL del backend (p. ej. `https://api.tudominio.com`) — necesaria en builds Electron `file://` */
  readonly VITE_API_ORIGIN?: string
}
