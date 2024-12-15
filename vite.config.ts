import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
export default defineConfig({

  plugins: [react(), nodePolyfills()],
  optimizeDeps: {
    exclude: ['libav.js']
  },
  build: {
    target: 'esnext',
    rollupOptions: {
      output: {
        format: 'esm'
      }
    }
  },
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp'
    }
  }
})