import { isElectronAppShell } from '@/lib/electron'

function trimOrigin(value: string): string {
  return String(value).trim().replace(/\/$/, '')
}

/**
 * Backend de producción en Vercel (misma URL para navegador en `import.meta.env.PROD`
 * y referencia; en Electron empaquetado el valor efectivo la inyecta `main` vía IPC).
 */
export const PRODUCTION_API_ORIGIN = 'https://social-app-blue-three.vercel.app'

/**
 * Origen base del backend (sin `/api`). Punto único de verdad:
 * - **Electron** (cualquier build del renderer): `main` vía `getApiOrigin()` — dev: `http://localhost:3000`, empaquetado: producción.
 * - **Navegador, producción** (`import.meta.env.PROD`): `PRODUCTION_API_ORIGIN`.
 * - **Navegador, desarrollo** (`npm run dev`): `''` → rutas relativas `/api` (proxy de Vite).
 */
export function getApiBaseUrl(): string {
  if (typeof window !== 'undefined' && isElectronAppShell() && typeof window.electronAPI?.getApiOrigin === 'function') {
    const origin = window.electronAPI.getApiOrigin()
    if (origin != null && String(origin).trim()) {
      return trimOrigin(String(origin))
    }
  }
  if (import.meta.env.PROD) {
    return trimOrigin(PRODUCTION_API_ORIGIN)
  }
  return ''
}

/** Alias de `getApiBaseUrl` para código legado. */
export function resolveApiOrigin(): string {
  return getApiBaseUrl()
}
