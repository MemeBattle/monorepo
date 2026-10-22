import { defineConfig } from 'vitest/config'

/**
 * The unit suite, and nothing else: `test:ci` must run without CAS, Postgres or a network, because the root
 * `pnpm test:ci` runs every package in parallel. Vitest's default include would pick `tests/integration/**` up too,
 * so the include is stated here.
 */
export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts'],
  },
})
