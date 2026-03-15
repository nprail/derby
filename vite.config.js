import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'

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
    emptyOutDir: false,
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
      '/ws': { target: 'ws://localhost:3000', ws: true },
      '/videos': 'http://localhost:3000',
    },
  },
})
