import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 3006,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8006',
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('error', (err, req, res) => {
            console.error('Proxy error:', err.message);
          });
        }
      }
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    // Never inline a font into the stylesheet. Each font file covers one range
    // of characters, and a browser fetches only the ones a page uses; inlined,
    // every visitor would download them all before anything shows.
    assetsInlineLimit: (filePath) => (/\.woff2?$/.test(filePath) ? false : undefined)
  },
  test: {
    environment: 'jsdom',
    globals: true,
  }
})
