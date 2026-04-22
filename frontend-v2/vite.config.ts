import path from 'node:path'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { viteStaticCopy } from 'vite-plugin-static-copy'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const isElectronDev = process.env.ELECTRON_DEV === '1'
/** Puerto dedicado para no chocar con `npm run dev` (5173) cuando ambos corren a la vez. */
const electronDevPort = Number(process.env.ELECTRON_VITE_PORT ?? 5174)

// https://vite.dev/config/
export default defineConfig({
  /** Obligatorio para Electron (`file://`): rutas `/assets/...` no existen en disco. */
  base: './',
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
  },
  build: {
    /** ES moderno: menos polyfills y mejor codegen en Chromium/Electron embebido. */
    target: 'es2022',
    // Aumentamos el límite a 1000kB (1MB) porque el chunk de LiveKit (WebRTC) puede superar 500kB.
    chunkSizeWarningLimit: 1000,
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
})
