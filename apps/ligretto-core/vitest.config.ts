import { defineConfig } from 'vitest/config'

/** The unit and HTTP suites under Node; the Worker smoke suite has its own config (vitest.worker.config.ts). */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts'],
  },
})
