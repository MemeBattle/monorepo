import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
  },
  resolve: {
    alias: [
      {
        find: 'contentlayer/generated',
        replacement: fileURLToPath(new URL('./.contentlayer/generated', import.meta.url)),
      },
    ],
  },
})
