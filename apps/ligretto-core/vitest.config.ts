import { defineConfig } from 'vitest/config'

/**
 * The unit and HTTP suites under Node, PGlite included, no Docker. The Worker smoke suite (vitest.worker.config.ts)
 * and the store suite against a disposable Postgres (vitest.store.config.ts) have their own configs. `test/http` holds
 * the HTTP suites that compose the real adapters: the lint boundary of `src/http` keeps adapter imports out of it.
 */
export default defineConfig({
  test: {
    environment: 'node',
    // PGlite boot plus migrations in beforeAll, run in parallel with other packages' suites in CI.
    hookTimeout: 60_000,
    include: ['src/**/*.spec.ts', 'test/support/**/*.spec.ts', 'test/http/**/*.spec.ts', 'scripts/**/*.spec.ts'],
  },
})
