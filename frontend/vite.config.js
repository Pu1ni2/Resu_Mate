import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
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
    sourcemap: false
  }
})
