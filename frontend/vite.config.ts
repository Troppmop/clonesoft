import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    // Polling is needed for hot reload when files are bind-mounted from Windows into Docker
    watch: { usePolling: process.env.VITE_USE_POLLING === 'true' },
    proxy: {
      // Requests to /api/* are forwarded to the FastAPI backend
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
