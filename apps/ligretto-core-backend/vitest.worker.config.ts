import { createRequire } from 'node:module'
import path from 'node:path'

import { cloudflareTest } from '@cloudflare/vitest-plugin'
import { defineConfig } from 'vitest/config'

// Under this pool `pg`'s requires resolve with `import` conditions and without `workerd`, loading the wrong builds of
// pg-protocol and pg-cloudflare; `cf build` is not affected.
const requireFromPg = createRequire(createRequire(import.meta.url).resolve('pg'))
const pgProtocol = requireFromPg.resolve('pg-protocol')
// The `workerd` + `require` export, which Node's resolver cannot select.
const pgCloudflare = path.join(path.dirname(requireFromPg.resolve('pg-cloudflare/package.json')), 'dist/index.js')

export default defineConfig({
  plugins: [
    cloudflareTest({
      experimental: { newConfig: true },
      miniflare: {
        serviceBindings: {
          INTERNAL: { name: 'ligretto-core-backend', entrypoint: 'InternalApi' },
        },
      },
    }),
  ],
  resolve: {
    alias: [
      { find: /^pg-protocol$/, replacement: pgProtocol },
      { find: /^pg-cloudflare$/, replacement: pgCloudflare },
    ],
  },
  test: {
    include: ['test/worker/**/*.spec.ts'],
    // A spec file's first request takes up to 5 s (the default limit), in a test or in a hook.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
})
