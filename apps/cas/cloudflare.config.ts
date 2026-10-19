// The CAS Worker (src/worker.rs, ADR 0022), deployed with `cf deploy`. The
// build itself is Wrangler's, configured in wrangler.config.ts.
import { bindings, defineConfig } from 'cf/config'

export default defineConfig({
  worker: {
    name: 'cas',
    compatibilityDate: '2026-10-01',
    entrypoint: 'build/index.js',
    domains: ['cas.mems.fun'],
    // The SPA (apps/cas-frontend) and CAS share one origin: CAS's own paths
    // reach the Worker, everything else is a static asset, and a path with no
    // asset is the SPA's index.html. The assets directory is set in
    // wrangler.config.ts.
    assets: {
      notFoundHandling: 'single-page-application',
      runWorkerFirst: ['/api/*', '/oidc/*', '/.well-known/*', '/health', '/openapi.json'],
    },
    observability: {
      enabled: true,
    },
    env: {
      // Query cache disabled: the cache answers sqlx's Parse/Describe itself
      // and the Bind that follows lands on the wrong statement (ADR 0022 (a)).
      HYPERDRIVE: bindings.hyperdrive({
        id: '66007e57e9d442118a397263b8ec5b86',
        dev: {
          connectionString: 'postgres://cas:cas@localhost:5434/cas',
        },
      }),
      CAS_RP_ID: bindings.text('cas.mems.fun'),
      CAS_ORIGIN: bindings.text('https://cas.mems.fun'),
      CAS_CORS_ORIGINS: bindings.text('https://cas.mems.fun'),
      CAS_ISSUER: bindings.text('https://cas.mems.fun'),
      // The private key every token is signed with (ADR 0022 (e)).
      CAS_SIGNING_KEY: bindings.secret(),
    },
  },
})
