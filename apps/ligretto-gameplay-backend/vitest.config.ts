import { defineConfig } from 'vitest/config'

/** The rules under plain Node. The transport has its own suite under workerd (vitest.worker.config.ts). */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts'],
  },
})
