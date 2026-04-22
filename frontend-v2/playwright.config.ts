import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, devices } from '@playwright/test'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
/** Raíz del monorepo (Social Club) — para arrancar `server.js` */
const repoRoot = path.join(__dirname, '..')
const defaultBaseUrl = 'http://127.0.0.1:5173'
const port = (() => {
  try {
    return new URL(process.env.PLAYWRIGHT_BASE_URL || defaultBaseUrl).port
  } catch {
    return '5173'
  }
})()
const baseURL = process.env.PLAYWRIGHT_BASE_URL || defaultBaseUrl
const skipWeb = process.env.PLAYWRIGHT_SKIP_WEBSERVER === '1'

/**
 * Fase 4 — E2E: API en 3000 (proxy de Vite) + cliente en 5173.
 * Requiere `.env` en la raíz del monorepo con credenciales de Supabase / backend.
 *
 * Uso: `E2E_USERNAME=mi_user_de_prueba npx playwright test`
 * El usuario de prueba debe existir o poder registrarse, y **tener al menos 1 conversación MD**.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 180_000,
  expect: { timeout: 30_000 },
  reporter: process.env.CI ? [['github'], ['line']] : [['list']],
  use: {
    baseURL,
    trace: 'on-first-failure',
    video: 'retain-on-failure',
    ...devices['Desktop Chrome'],
    // Tras el spread: el rail de servidores exige `md:` (pantalla ancha) para no quedar en `display:none`
    viewport: { width: 1280, height: 800 },
  },
  projects: [
    {
      name: 'chromium',
    },
  ],
  ...(skipWeb
    ? {}
    : {
        webServer: [
          {
            command: 'node server.js',
            cwd: repoRoot,
            url: 'http://127.0.0.1:3000/api/health',
            reuseExistingServer: !process.env.CI,
            timeout: 120_000,
            stdout: 'pipe',
            stderr: 'pipe',
          },
          {
            // Sin ELECTRON_DEV el puerto por defecto de Vite es 5173; alineado con `baseURL`
            command: `npx vite --port ${port} --host 127.0.0.1`,
            cwd: __dirname,
            url: baseURL,
            reuseExistingServer: !process.env.CI,
            timeout: 120_000,
            stdout: 'pipe',
            stderr: 'pipe',
          },
        ],
      }),
})
