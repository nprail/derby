import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'

const backendPort = process.env.BACKEND_PORT || 3000
const backendOrigin = `http://localhost:${backendPort}`

export default defineConfig({
  root: 'src',
  plugins: [react(), tailwindcss()],
  build: {
    outDir: resolve(__dirname, 'public'),
    rollupOptions: {
      input: {
        guest: resolve(__dirname, 'src/guest.html'),
        manage: resolve(__dirname, 'src/manage.html'),
        admin: resolve(__dirname, 'src/admin.html'),
      },
    },
    // Keep other files in public/ (videos, static assets served by the server)
    emptyOutDir: false,
  },
  server: {
    proxy: {
      '/api': backendOrigin,
      '/ws': { target: `ws://localhost:${backendPort}`, ws: true },
      '/videos': backendOrigin,
    },
  },
})
