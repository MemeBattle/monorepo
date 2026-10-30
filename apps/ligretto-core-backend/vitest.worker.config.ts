import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

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

/** The SPA of the Build Output, the files a release uploads, not `dist`. */
const assetsDirectory = fileURLToPath(new URL('.cloudflare/output/v0/workers/default/assets', import.meta.url))
if (!existsSync(path.join(assetsDirectory, 'index.html'))) {
  throw new Error(`No SPA in ${assetsDirectory}: the Worker smoke suite runs on the Build Output, run \`pnpm build:worker\` first.`)
}

/**
 * The Worker smoke suite: the entry as configured in cloudflare.config.ts, under workerd. `INTERNAL` is a service
 * binding of the Worker to its own `InternalApi` entrypoint, so the suite reaches it the way another Worker would.
 */
export default defineConfig({
  plugins: [
    cloudflareTest({
      experimental: { newConfig: true },
      miniflare: {
        // `newConfig` does not wire the assets binding of cloudflare.config.ts here, so the suite declares it.
        // scripts/cloudflare-config.spec.ts pins the production value this repeats.
        assets: {
          directory: assetsDirectory,
          binding: 'ASSETS',
          assetConfig: { not_found_handling: 'single-page-application' },
        },
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
    // The first request of a file loads the Worker's whole module graph into its isolate, in 3 s or 5 s here, which sits
    // on the default limit of 5 s. A later test is a plain request.
    testTimeout: 30_000,
  },
})
