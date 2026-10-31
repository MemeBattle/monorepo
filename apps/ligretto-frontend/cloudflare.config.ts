// The ligretto-frontend Worker: the SPA as static assets, released with `pnpm build:worker`, which runs `vite build` and
// then `cf-wrangler build --mode production`. wrangler.config.ts names the assets directory.
//
// Not `cf build`: in a package that depends on vite it detects the Vite framework and delegates to `vite build`, which
// writes no Build Output without @cloudflare/vite-plugin. `cf-wrangler` is the delegate `cf build` runs for a Wrangler
// project such as ligretto-core-backend, and `cf deploy --prebuilt` reads its Build Output the same way.
//
// An assets-only Worker: no entrypoint, no bindings, no secrets. Every request it receives is answered by the assets
// layer, never by Worker code, so a static request is not an invocation. It owns the route `ligretto.app/*`; the
// routes of ligretto-core-backend (`/api*`, `/health`, `/openapi.json`) are more specific and win, and
// `ligretto.app/gameplay/*` is reserved for the gameplay Worker
// (apps/ligretto-core-backend/docs/adrs/production-deployment-on-workers.md).
//
// The SPA's own build values come from the root .env / .env.production through vite.config.ts; this file holds only
// the Worker's production values. `mode` is 'production' for the release build and undefined otherwise.
import { defineConfig, triggers } from 'cf/config'

const PUBLIC_HOST = 'ligretto.app'

export default defineConfig(({ mode }) => {
  const production = mode === 'production'

  return {
    worker: {
      name: 'ligretto-frontend',
      compatibilityDate: '2026-08-04',
      // A path the files do not hold answers index.html, so the client router takes deep links.
      assets: {
        notFoundHandling: 'single-page-application',
      },
      workersDev: false,
      // Production only, like the core's routes: a local build declares no route.
      triggers: production ? [triggers.fetch({ pattern: `${PUBLIC_HOST}/*`, zone: PUBLIC_HOST })] : [],
    },
  }
})
