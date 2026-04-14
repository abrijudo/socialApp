import path from 'node:path'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { viteStaticCopy } from 'vite-plugin-static-copy'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig({
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
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
  build: {
    // Aumentamos el límite a 1000kB (1MB) porque el chunk diferido de LiveKit (WebRTC) supera los 500kB por defecto, lo cual es esperado y ya está aislado con Code-Splitting.
    chunkSizeWarningLimit: 1000,
  },
})
