// Built by `vite build && cf-wrangler build`, not `cf build`: here `cf build` delegates to `vite build`, which writes
// no Build Output. wrangler.config.ts names the assets directory.
import { defineConfig, triggers } from 'cf/config'

const PUBLIC_HOST = 'ligretto.app'

export default defineConfig(({ mode }) => {
  const production = mode === 'production'

  return {
    worker: {
      name: 'ligretto-frontend',
      compatibilityDate: '2026-08-04',
      assets: {
        notFoundHandling: 'single-page-application',
      },
      workersDev: false,
      triggers: production ? [triggers.fetch({ pattern: `${PUBLIC_HOST}/*`, zone: PUBLIC_HOST })] : [],
    },
  }
})
