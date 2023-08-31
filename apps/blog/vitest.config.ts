import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    alias: {
      '@/i18n': new URL('./src/i18n', import.meta.url).pathname,
      '@/components': new URL('./src/components', import.meta.url).pathname,
      '@/utils': new URL('./src/utils', import.meta.url).pathname,
    },
  },
  resolve: {
    alias: [
      {
        find: 'contentlayer/generated',
        replacement: fileURLToPath(new URL('./.contentlayer/generated', import.meta.url)),
      },
      {
        find: './src/components',
        replacement: fileURLToPath(new URL('@/components', import.meta.url)),
      },
      {
        find: './src/utils',
        replacement: fileURLToPath(new URL('@/utils', import.meta.url)),
      },
      {
        find: './src/i18n',
        replacement: fileURLToPath(new URL('@/i18n', import.meta.url)),
      },
      {
        find: './src/assets',
        replacement: fileURLToPath(new URL('@/assets', import.meta.url)),
      },
    ],
  },
})
