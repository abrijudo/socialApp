/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** `f32` (defecto) o `s16` — formato PCM del binario application-loopback */
  readonly VITE_ELECTRON_WASAPI_PCM_FORMAT?: 'f32' | 's16'
}
