import path from 'node:path'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { viteStaticCopy } from 'vite-plugin-static-copy'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const isElectronDev = process.env.ELECTRON_DEV === '1'
/** Puerto dedicado para no chocar con `npm run dev` (5173) cuando ambos corren a la vez. */
const electronDevPort = Number(process.env.ELECTRON_VITE_PORT ?? 5174)

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const fromRoot = loadEnv(mode, repoRoot, 'VITE_')
  const fromFrontend = loadEnv(mode, __dirname, 'VITE_')
  const mergedVite = { ...fromRoot, ...fromFrontend }
  for (const [k, v] of Object.entries(mergedVite)) {
    if (v != null) process.env[k] = v
  }

  const isProd = mode === 'production' || process.env.NODE_ENV === 'production'

  return {
    /** Raíz del cliente (evita dudas en monorepo). */
    root: path.resolve(__dirname),
    /** Obligatorio para Electron (`file://`): rutas `/assets/...` no existen en disco. */
    base: './',
    /**
     * Carga `VITE_*` desde `../.env` (raíz monorepo) y desde `frontend-v2/.env*`.
     * Así `VITE_API_ORIGIN` puede vivir junto a Supabase/Livekit en el `.env` de la raíz
     * (Vercel: URL pública **sin** `/api`, p. ej. `https://tu-proyecto.vercel.app`).
     */
    envDir: repoRoot,
    plugins: [
      react(),
      tailwindcss(),
      viteStaticCopy({
        targets: [
          {
            src: 'node_modules/@livekit/krisp-noise-filter/dist/*',
            dest: 'krisp',
          },
        ],
      }),
    ],
    optimizeDeps: {
      exclude: ['@livekit/krisp-noise-filter', 'livekit-client'],
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      ...(isElectronDev ? { port: electronDevPort, strictPort: true } : {}),
      proxy: {
        '/api': { target: 'http://localhost:3000', changeOrigin: true },
      },
      watch: {
        ignored: [
          '**/node_modules/**',
          '**/dist/**',
          '**/.vite/**',
          '**/release/**',
          '**/electron-data-dev/**',
          '**/.env*',
          '**/*.tsbuildinfo',
          // Raíz monorepo (../ respecto a frontend-v2): API, supabase, lockfile, etc.
          '../backend/**',
          '../node_modules/**',
          '../server.js',
          '../supabase/**',
          '../*.json',
          '../*.log',
          '../*.db',
        ],
      },
    },
    build: {
      /** ES moderno: menos polyfills y mejor codegen en Chromium/Electron embebido. */
      target: 'es2022',
      // Aumentamos el límite a 1000kB (1MB) porque el chunk de LiveKit (WebRTC) puede superar 500kB.
      chunkSizeWarningLimit: 1000,
      // En producción desactivar el watcher de Rollup por completo para que
      // @tailwindcss/vite no entre en bucle al detectar cambios en dist/ durante el build.
      ...(isProd ? { watch: null } : {}),
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return
            if (id.includes('livekit-client') || id.includes('@livekit')) return 'livekit-vendor'
            if (id.includes('react-dom')) return 'react-vendor'
            if (id.includes('node_modules/react/') || id.includes('node_modules\\react\\')) return 'react-vendor'
          },
        },
      },
    },
  }
})