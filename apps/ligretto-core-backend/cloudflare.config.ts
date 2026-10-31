// Wrangler bundles the TypeScript entrypoint itself, so there is no wrangler.config.ts.
// Hyperdrive needs `compatibility_date` >= 2026-08-04 and `pg` >= 8.16.3.
import { bindings, defineConfig, exports, triggers } from 'cf/config'

// Both must have caching disabled; scripts/check-release.sh verifies it before every release.
const HYPERDRIVE_MAIN_ID = '1ce28ac44ae848aea317d36c3dc828c5'
const HYPERDRIVE_LOCKS_ID = 'fa5cbf397388476086cddacaca0bc77a'
const DEV_DATABASE = 'postgres://ligretto-core-user:ligretto_pg_password@localhost:5433/ligretto-core'

const PUBLIC_HOST = 'ligretto.app'
const INTERNAL_HOST = 'core-internal.ligretto.app'

// A route pattern matches the query string too: without the trailing `*`, `/health?probe=1` would reach the SPA.
const PUBLIC_ROUTES = ['/api*', '/health*', '/openapi.json*'].map(path => triggers.fetch({ pattern: `${PUBLIC_HOST}${path}`, zone: PUBLIC_HOST }))

const PRODUCTION = {
  LIGRETTO_CORE_PUBLIC_HOST: PUBLIC_HOST,
  LIGRETTO_CORE_INTERNAL_HOST: INTERNAL_HOST,
  // Empty: the routes put the API on the SPA's origin.
  LIGRETTO_CORE_CORS_ORIGINS: '',
  CAS_ISSUER: 'https://cas.mems.fun',
  LIGRETTO_CORE_AUTH_REDIRECT_URI: `https://${PUBLIC_HOST}/api/auth/callback`,
  LIGRETTO_CORE_AUTH_POST_LOGOUT_REDIRECT_URI: `https://${PUBLIC_HOST}/`,
  LIGRETTO_CORE_AUTH_APP_URL: `https://${PUBLIC_HOST}/`,
}

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
      compatibilityDate: '2026-08-04',
      compatibilityFlags: ['nodejs_compat'],
      entrypoint: 'src/entry/worker.ts',
      observability: {
        enabled: true,
      },
      // Production only: `cf dev` rewrites `request.url` to the first domain, which breaks the hostname dispatch.
      domains: production ? [INTERNAL_HOST] : [],
      workersDev: false,
      // Off the hour, when most cron triggers fire.
      triggers: [triggers.scheduled({ schedule: '7 * * * *' }), ...(production ? PUBLIC_ROUTES : [])],
      env: {
        HYPERDRIVE_MAIN: bindings.hyperdrive({ id: HYPERDRIVE_MAIN_ID, dev: { connectionString: DEV_DATABASE } }),
        HYPERDRIVE_LOCKS: bindings.hyperdrive({ id: HYPERDRIVE_LOCKS_ID, dev: { connectionString: DEV_DATABASE } }),
        LIGRETTO_CORE_PUBLIC_HOST: bindings.text(values.LIGRETTO_CORE_PUBLIC_HOST),
        LIGRETTO_CORE_INTERNAL_HOST: bindings.text(values.LIGRETTO_CORE_INTERNAL_HOST),
        LIGRETTO_CORE_CORS_ORIGINS: bindings.text(values.LIGRETTO_CORE_CORS_ORIGINS),
        LOG_LEVEL: bindings.text('info'),
        LIGRETTO_INTERNAL_API_TOKEN: bindings.secret(),
        LIGRETTO_CAS_CLIENT_SECRET: bindings.secret(),
        // Read by nothing on the Worker; declared so that scripts/check-release.sh covers it too.
        DATABASE_URL: bindings.secret(),
        CAS_ISSUER: bindings.text(values.CAS_ISSUER),
        LIGRETTO_CAS_CLIENT_ID: bindings.text('ligretto'),
        LIGRETTO_CORE_AUTH_REDIRECT_URI: bindings.text(values.LIGRETTO_CORE_AUTH_REDIRECT_URI),
        LIGRETTO_CORE_AUTH_POST_LOGOUT_REDIRECT_URI: bindings.text(values.LIGRETTO_CORE_AUTH_POST_LOGOUT_REDIRECT_URI),
        LIGRETTO_CORE_AUTH_APP_URL: bindings.text(values.LIGRETTO_CORE_AUTH_APP_URL),
        LIGRETTO_CORE_AUTH_SESSION_TRANSPORT: bindings.text('cookie'),
      },
      exports: {
        InternalApi: exports.worker(),
      },
    },
  }
})
