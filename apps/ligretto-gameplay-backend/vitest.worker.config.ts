import { cloudflareTest } from '@cloudflare/vitest-plugin'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
      // test/worker/support.ts answers both origins; nothing leaves the suite.
      miniflare: {
        bindings: {
          CAS_ISSUER: 'http://localhost:3000',
          LIGRETTO_CORE_URL: 'http://localhost:3333',
          LIGRETTO_INTERNAL_API_TOKEN: 'test-internal-api-token',
        },
      },
    }),
  ],
  test: {
    include: ['test/worker/**/*.spec.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
})
