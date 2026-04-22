/**
 * Carga `../.env` (raíz del monorepo) y `frontend-v2/.env` para que
 * `electron-builder --publish` reciba `GH_TOKEN` / `GITHUB_TOKEN`.
 * Si solo tienes `Github_Token` (nombre antiguo), se copia a `GH_TOKEN`.
 */
import { config } from 'dotenv'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const frontendV2 = resolve(__dirname, '..')
const repoRoot = resolve(frontendV2, '..')

config({ path: resolve(repoRoot, '.env') })
config({ path: resolve(frontendV2, '.env') })

if (!process.env.GH_TOKEN?.trim() && !process.env.GITHUB_TOKEN?.trim() && process.env.Github_Token) {
  process.env.GH_TOKEN = String(process.env.Github_Token).trim()
}

const opts = { stdio: 'inherit', cwd: frontendV2, env: { ...process.env }, shell: true }
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm'

let r = spawnSync(npmCmd, ['run', 'build'], opts)
if (r.status) process.exit(r.status ?? 1)

r = spawnSync(process.execPath, [resolve(frontendV2, 'scripts/ensure-electron-pack-assets.mjs')], {
  stdio: 'inherit',
  cwd: frontendV2,
  env: process.env,
  shell: false,
})
if (r.status) process.exit(r.status ?? 1)

r = spawnSync(npmCmd, ['exec', '--', 'electron-builder', '--publish', 'always'], opts)
process.exit(r.status ?? 0)
