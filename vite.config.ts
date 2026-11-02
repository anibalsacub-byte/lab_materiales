import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// BASE_PATH permite publicar en una subcarpeta (p. ej. GitHub Pages: /lab-resistencia-materiales/).
const base = process.env.BASE_PATH ?? '/'

// https://vite.dev/config/
export default defineConfig({
  base,
  plugins: [react()],
})
