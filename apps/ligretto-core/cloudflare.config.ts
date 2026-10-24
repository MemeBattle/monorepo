// The ligretto-core Worker (src/entry/worker.ts), developed with `cf dev` and built with `cf build`; Wrangler bundles
// the TypeScript entrypoint itself, so there is no wrangler.config.ts.
import { bindings, defineConfig, exports } from 'cf/config'

// Placeholders: https://github.com/MemeBattle/monorepo/issues/843 creates the two cache-disabled Hyperdrive
// configurations (docs/adrs/database-access-with-kysely.md) and replaces these ids. `cf dev` and the Worker tests
// connect to the development database through `dev.connectionString` instead.
const PLACEHOLDER_HYPERDRIVE_ID = '00000000000000000000000000000000'
const DEV_DATABASE = 'postgres://ligretto-core-user:ligretto_pg_password@localhost:5433/ligretto-core'

export default defineConfig({
  worker: {
    name: 'ligretto-core',
    // Node.js compatibility is on by default from this date; the flag states it anyway.
    compatibilityDate: '2026-08-04',
    compatibilityFlags: ['nodejs_compat'],
    entrypoint: 'src/entry/worker.ts',
    observability: {
      enabled: true,
    },
    env: {
      HYPERDRIVE_MAIN: bindings.hyperdrive({ id: PLACEHOLDER_HYPERDRIVE_ID, dev: { connectionString: DEV_DATABASE } }),
      HYPERDRIVE_LOCKS: bindings.hyperdrive({ id: PLACEHOLDER_HYPERDRIVE_ID, dev: { connectionString: DEV_DATABASE } }),
      // Development hostnames: `Host: internal.localhost` reaches the internal app under `cf dev`. #843 sets the
      // production ones together with `domains`.
      LIGRETTO_CORE_PUBLIC_HOST: bindings.text('localhost'),
      LIGRETTO_CORE_INTERNAL_HOST: bindings.text('internal.localhost'),
      LIGRETTO_CORE_CORS_ORIGINS: bindings.text('http://localhost:5173,http://localhost:5174'),
      LOG_LEVEL: bindings.text('info'),
      // The shared secret of the internal API: locally from .dev.vars, in production set once with
      // `cf deploy --secrets-file` (#843).
      LIGRETTO_INTERNAL_API_TOKEN: bindings.secret(),
      // The CAS client and the auth handlers, with the development values of the root .env.development; #843 sets the
      // production ones. The client secret is a secret like the internal token: .dev.vars locally.
      CAS_ISSUER: bindings.text('http://localhost:3000'),
      LIGRETTO_CAS_CLIENT_ID: bindings.text('ligretto'),
      LIGRETTO_CAS_CLIENT_SECRET: bindings.secret(),
      LIGRETTO_CORE_AUTH_REDIRECT_URI: bindings.text('http://localhost:3333/api/auth/callback'),
      LIGRETTO_CORE_AUTH_POST_LOGOUT_REDIRECT_URI: bindings.text('http://localhost:5174/'),
      LIGRETTO_CORE_AUTH_APP_URL: bindings.text('http://localhost:5174/'),
      LIGRETTO_CORE_AUTH_SESSION_TRANSPORT: bindings.text('cookie'),
    },
    exports: {
      // The named WorkerEntrypoint other Workers reach through a service binding.
      InternalApi: exports.worker(),
    },
  },
})
