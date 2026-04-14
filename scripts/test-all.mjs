import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const baseUrl = process.env.BASE_URL || 'http://localhost:3000'
const healthUrl = `${baseUrl}/api/health`

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

async function isHealthy() {
  try {
    const res = await fetch(healthUrl)
    return res.ok
  } catch {
    return false
  }
}

async function waitForHealth(timeoutMs = 30_000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (await isHealthy()) return true
    await sleep(750)
  }
  return false
}

async function main() {
  const alreadyUp = await isHealthy()
  let serverProc = null

  if (!alreadyUp) {
    serverProc = spawn(process.execPath, [join(root, 'server.js')], {
      cwd: root,
      stdio: 'inherit',
    })
    const ok = await waitForHealth()
    if (!ok) {
      if (serverProc && !serverProc.killed) serverProc.kill('SIGTERM')
      throw new Error(`No se pudo levantar el servidor en ${healthUrl}`)
    }
  }

  const runner = spawn(process.execPath, [join(root, 'scripts', 'run-all-tests.mjs')], {
    cwd: root,
    stdio: 'inherit',
  })

  const code = await new Promise((resolve, reject) => {
    runner.on('error', reject)
    runner.on('close', resolve)
  })

  if (serverProc && !serverProc.killed) {
    serverProc.kill('SIGTERM')
  }

  process.exit(Number(code) || 0)
}

main().catch((err) => {
  console.error(err?.message || err)
  process.exit(1)
})
