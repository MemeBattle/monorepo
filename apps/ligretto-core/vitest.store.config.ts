import { defineConfig } from 'vitest/config'

/**
 * The store suite: what needs a real Postgres (two connections, row locks, the migrate entry), against the disposable
 * database of test/support/disposable-database.ts. One database, so the files run one at a time.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/store/**/*.spec.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
})
