import { defineConfig } from 'vitest/config'

/**
 * The transport's unit suite beside the source, and the contract suites under `test/`, which drive the generated
 * operations against ligretto-core's apps over PGlite: no network, no Docker.
 */
export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts', 'test/**/*.spec.ts'],
    environment: 'node',
  },
})
