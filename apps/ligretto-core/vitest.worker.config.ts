import { cloudflareTest } from '@cloudflare/vitest-plugin'
import { defineConfig } from 'vitest/config'

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
  test: {
    include: ['test/worker/**/*.spec.ts'],
  },
})
