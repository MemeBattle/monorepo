// The CAS Worker (src/worker.rs, ADR 0022), deployed with `cf deploy`. The
// build itself is Wrangler's, configured in wrangler.config.ts.
import { bindings, defineConfig, triggers } from 'cf/config'

export default defineConfig({
  worker: {
    name: 'cas',
    compatibilityDate: '2026-10-01',
    entrypoint: 'build/index.js',
    // The SPA and CAS share one origin (apps/cas-frontend/vite.config.ts):
    // the Worker takes CAS's own paths, the rest of the hostname goes to
    // whatever serves the frontend.
    triggers: [
      'cas.mems.fun/api/*',
      'cas.mems.fun/oidc/*',
      'cas.mems.fun/.well-known/*',
      'cas.mems.fun/health',
      'cas.mems.fun/openapi.json',
    ].map(pattern => triggers.fetch({ pattern, zone: 'mems.fun' })),
    observability: {
      enabled: true,
    },
    env: {
      // Query cache disabled: the cache answers sqlx's Parse/Describe itself
      // and the Bind that follows lands on the wrong statement (ADR 0022 (a)).
      HYPERDRIVE: bindings.hyperdrive({
        id: 'c30b40cb57a948f29a74710d3f67e636',
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
