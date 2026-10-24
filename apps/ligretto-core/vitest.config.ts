import { defineConfig } from 'vitest/config'

/**
 * The unit and HTTP suites under Node, PGlite included, no Docker. The Worker smoke suite (vitest.worker.config.ts)
 * and the store suite against a disposable Postgres (vitest.store.config.ts) have their own configs.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts', 'test/support/**/*.spec.ts', 'scripts/**/*.spec.ts'],
  },
})
