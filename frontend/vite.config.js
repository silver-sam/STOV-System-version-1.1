import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // Exposes the server to your local network
    port: 5173,
    allowedHosts: true, // Allows Cloudflare Tunnels to bypass the host check
    proxy: {
      '/api': {
        target: 'http://localhost:8000', // Try localhost instead of 127.0.0.1
        changeOrigin: true,
        secure: false, // Don't enforce HTTPS on the local Python backend
        rewrite: (path) => path.replace(/^\/api/, '') // Removes /api before sending to Python
      }
    }
  }
})
