import { defineConfig } from 'vitest/config'

/**
 * The integration suite, which needs a real CAS: the README says how to bring one up. Kept out of `test:ci` by the
 * include of `vitest.config.ts`.
 *
 * The timeouts are generous because one test is a whole story — several token round trips and two passkey ceremonies
 * against a CAS sharing a CI runner with Postgres — and a slow story must not be reported as a protocol failure.
 */
export default defineConfig({
  test: {
    include: ['tests/integration/**/*.spec.ts'],
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
})
