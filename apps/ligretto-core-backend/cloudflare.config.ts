// The ligretto-core-backend Worker (src/entry/worker.ts), developed with `cf dev` and released with `pnpm build:worker`,
// which is `cf build --mode production`; Wrangler bundles the TypeScript entrypoint itself, so there is no
// wrangler.config.ts. This file is the single source of the production values (docs/adrs/production-deployment-on-workers.md):
// `mode` is 'production' for that build and undefined under `cf dev` and @cloudflare/vitest-plugin, which take the
// development branch. The floor of this deployment is `compatibility_date` >= 2026-08-04 and `pg` >= 8.16.3, the version
// Cloudflare documents for Hyperdrive; scripts/cloudflare-config.spec.ts holds both.
import { bindings, defineConfig, exports, triggers } from 'cf/config'

// Two caching-disabled configurations of the same Neon database (docs/adrs/database-access-with-kysely.md). Their
// connection limits are budgeted together (README.md § Connection budget); scripts/check-release.sh reads the caching
// setting back before every release. `cf dev` and the Worker tests connect through `dev.connectionString` instead.
const HYPERDRIVE_MAIN_ID = '1ce28ac44ae848aea317d36c3dc828c5'
const HYPERDRIVE_LOCKS_ID = 'fa5cbf397388476086cddacaca0bc77a'
const DEV_DATABASE = 'postgres://ligretto-core-user:ligretto_pg_password@localhost:5433/ligretto-core'

const PUBLIC_HOST = 'core.ligretto.app'
const INTERNAL_HOST = 'core-internal.ligretto.app'

const PRODUCTION = {
  LIGRETTO_CORE_PUBLIC_HOST: PUBLIC_HOST,
  LIGRETTO_CORE_INTERNAL_HOST: INTERNAL_HOST,
  LIGRETTO_CORE_CORS_ORIGINS: 'https://ligretto.app',
  CAS_ISSUER: 'https://cas.mems.fun',
  LIGRETTO_CORE_AUTH_REDIRECT_URI: `https://${PUBLIC_HOST}/api/auth/callback`,
  LIGRETTO_CORE_AUTH_POST_LOGOUT_REDIRECT_URI: 'https://ligretto.app/',
  LIGRETTO_CORE_AUTH_APP_URL: 'https://ligretto.app/',
}

// The values of the root .env.development. `Host: internal.localhost` reaches the internal app under `cf dev`.
const DEVELOPMENT: typeof PRODUCTION = {
  LIGRETTO_CORE_PUBLIC_HOST: 'localhost',
  LIGRETTO_CORE_INTERNAL_HOST: 'internal.localhost',
  LIGRETTO_CORE_CORS_ORIGINS: 'http://localhost:5173,http://localhost:5174',
  CAS_ISSUER: 'http://localhost:3000',
  LIGRETTO_CORE_AUTH_REDIRECT_URI: 'http://localhost:3333/api/auth/callback',
  LIGRETTO_CORE_AUTH_POST_LOGOUT_REDIRECT_URI: 'http://localhost:5174/',
  LIGRETTO_CORE_AUTH_APP_URL: 'http://localhost:5174/',
}

export default defineConfig(({ mode }) => {
  const production = mode === 'production'
  const values = production ? PRODUCTION : DEVELOPMENT

  return {
    worker: {
      name: 'ligretto-core-backend',
      // Node.js compatibility is on by default from this date; the flag states it anyway.
      compatibilityDate: '2026-08-04',
      compatibilityFlags: ['nodejs_compat'],
      entrypoint: 'src/entry/worker.ts',
      observability: {
        enabled: true,
      },
      // Production only: `cf dev` rewrites `request.url` to the first domain, and the hostname dispatch of
      // src/entry/worker.ts would then answer every local request `unknown_host`.
      domains: production ? [PUBLIC_HOST, INTERNAL_HOST] : [],
      // Off everywhere: the dispatch would refuse a workers.dev hostname anyway.
      workersDev: false,
      // Hourly, so a run has a small batch; off the hour, which is when most cron triggers fire.
      triggers: [triggers.scheduled({ schedule: '7 * * * *' })],
      env: {
        HYPERDRIVE_MAIN: bindings.hyperdrive({ id: HYPERDRIVE_MAIN_ID, dev: { connectionString: DEV_DATABASE } }),
        HYPERDRIVE_LOCKS: bindings.hyperdrive({ id: HYPERDRIVE_LOCKS_ID, dev: { connectionString: DEV_DATABASE } }),
        LIGRETTO_CORE_PUBLIC_HOST: bindings.text(values.LIGRETTO_CORE_PUBLIC_HOST),
        LIGRETTO_CORE_INTERNAL_HOST: bindings.text(values.LIGRETTO_CORE_INTERNAL_HOST),
        LIGRETTO_CORE_CORS_ORIGINS: bindings.text(values.LIGRETTO_CORE_CORS_ORIGINS),
        LOG_LEVEL: bindings.text('info'),
        // Secrets: .dev.vars locally. In production the first activation sets them on the Worker and every release
        // inherits them (README.md § First activation); scripts/check-release.sh refuses a release while one is missing.
        LIGRETTO_INTERNAL_API_TOKEN: bindings.secret(),
        LIGRETTO_CAS_CLIENT_SECRET: bindings.secret(),
        // Held on the Worker and read by nothing there: the runtime connects only through the Hyperdrive bindings, and
        // the release's migration uses the Actions secret of the same name. Declaring it keeps the release's check and
        // the deploy's secret binding covering it like the other two.
        DATABASE_URL: bindings.secret(),
        // The CAS client and the auth handlers.
        CAS_ISSUER: bindings.text(values.CAS_ISSUER),
        LIGRETTO_CAS_CLIENT_ID: bindings.text('ligretto'),
        LIGRETTO_CORE_AUTH_REDIRECT_URI: bindings.text(values.LIGRETTO_CORE_AUTH_REDIRECT_URI),
        LIGRETTO_CORE_AUTH_POST_LOGOUT_REDIRECT_URI: bindings.text(values.LIGRETTO_CORE_AUTH_POST_LOGOUT_REDIRECT_URI),
        LIGRETTO_CORE_AUTH_APP_URL: bindings.text(values.LIGRETTO_CORE_AUTH_APP_URL),
        LIGRETTO_CORE_AUTH_SESSION_TRANSPORT: bindings.text('cookie'),
      },
      exports: {
        // The named WorkerEntrypoint other Workers reach through a service binding.
        InternalApi: exports.worker(),
      },
    },
  }
})
