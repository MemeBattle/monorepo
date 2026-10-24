import { createRequire } from 'node:module'
import path from 'node:path'

import { cloudflareTest } from '@cloudflare/vitest-plugin'
import { defineConfig } from 'vitest/config'

/**
 * Where `pg` finds its own dependencies. Under this pool a `require` inside `pg` is resolved with the conditions of an
 * `import` and without `workerd`, so two of them load the wrong build: pg-protocol's ESM files (in a CommonJS
 * package) and pg-cloudflare's empty Node stub instead of its socket. The aliases point both at the CommonJS build
 * the Workers runtime needs. Test-only: `cf build` bundles with the right conditions.
 */
const requireFromPg = createRequire(createRequire(import.meta.url).resolve('pg'))
// The `require` entry, which is the CommonJS build.
const pgProtocol = requireFromPg.resolve('pg-protocol')
// The `workerd` + `require` entry of its exports, which Node's resolver cannot select.
const pgCloudflare = path.join(path.dirname(requireFromPg.resolve('pg-cloudflare/package.json')), 'dist/index.js')

/**
 * The Worker smoke suite: the entry as configured in cloudflare.config.ts, under workerd. `INTERNAL` is a service
 * binding of the Worker to its own `InternalApi` entrypoint, so the suite reaches it the way another Worker would.
 */
export default defineConfig({
  plugins: [
    cloudflareTest({
      experimental: { newConfig: true },
      miniflare: {
        serviceBindings: {
          INTERNAL: { name: 'ligretto-core', entrypoint: 'InternalApi' },
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
  },
})
