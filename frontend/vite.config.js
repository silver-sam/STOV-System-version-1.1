import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

export default defineConfig({
  plugins: [
    react(),
    basicSsl(), // Adds temporary HTTPS
    {
      name: 'fix-node-22-bug',
      configureServer(server) {
        if (server.httpServer && typeof server.httpServer.shouldUpgradeCallback !== 'function') {
          server.httpServer.shouldUpgradeCallback = () => true;
        }
      }
    }
  ],
  server: {
    host: true, // Exposes the server to your local network
    port: 5173,
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
