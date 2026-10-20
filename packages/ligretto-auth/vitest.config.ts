import { defineConfig } from 'vitest/config'

/**
 * The unit suite, and nothing else: `test:ci` must run without CAS, Postgres or a network, because the root
 * `pnpm test:ci` runs every package in parallel. Vitest's default include would pick `tests/integration/**` up too,
 * so the selection is stated rather than left to the default.
 */
export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts'],
  },
})
