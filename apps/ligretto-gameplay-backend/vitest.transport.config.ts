import { defineConfig } from 'vitest/config'

/**
 * The transport contract: real Socket.IO clients against the standard Node engine and against the Workers engine in
 * local `workerd`, which test/transport/global-setup.ts starts and stops.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/transport/**/*.spec.ts'],
    globalSetup: ['test/transport/global-setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
})
