import { defineConfig } from 'vitest/config'

/**
 * The Node smoke suite: src/entry/node.ts booted as a child process on a free port with the development `.env` files
 * (test/node/global-setup.ts), asked over `fetch`. `/health` needs the Postgres `DATABASE_URL` points at; the suite
 * starts no Docker.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/node/**/*.spec.ts'],
    globalSetup: ['test/node/global-setup.ts'],
    testTimeout: 10_000,
  },
})
