/**
 * Ruta base para el WASM de Krisp. Con `file://` (Electron empaquetado) `/krisp` apunta
 * a la raíz del volumen, no a `dist/krisp` — hay que usar relativa al `index.html`.
 * En Vite, `import.meta.env.BASE_URL` + `krisp` cubre `http` y despliegues con subruta.
 */
export function getKrispFilterBasePath(): string {
  if (typeof window !== 'undefined' && window.location?.protocol === 'file:') {
    return './krisp'
  }
  const b = import.meta.env.BASE_URL
  if (!b || b === '/') {
    return '/krisp'
  }
  if (b.endsWith('/')) {
    return `${b}krisp`
  }
  return `${b}/krisp`
}
