/**
 * Tras `vite build`, vuelve a asegurar `build/icon.png` en la raíz del paquete
 * para `electron-builder` (campo `files` explícito).
 * `public/icon.png` → raíz de salida (idéntico a `dist/icon.png` emitido por Vite).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const from = path.join(root, 'public', 'icon.png')
const toDir = path.join(root, 'build')
const to = path.join(toDir, 'icon.png')

if (!fs.existsSync(from)) {
  console.warn('[ensure-electron-pack-assets] Falta public/icon.png')
  process.exit(0)
}
fs.mkdirSync(toDir, { recursive: true })
fs.copyFileSync(from, to)
console.log('[ensure-electron-pack-assets] build/icon.png listo')
