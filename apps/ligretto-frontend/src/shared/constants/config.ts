export const IS_DEV_MODE = import.meta.env?.DEV

// The origin of ligretto-core's public API, with no /api: the generated paths of @memebattle/ligretto-core-client
// start with /api. Set only in development and tests. '' when the build defines no value, which means the SPA's own
// origin: production, where the routes put the API on the SPA's origin, and Storybook, where the client only has to load.
export const LIGRETTO_CORE_URL = process.env.LIGRETTO_CORE_URL ?? ''

export const LIGRETTO_GAMEPLAY_URL = process.env.LIGRETTO_GAMEPLAY_URL
export const CAS_URL = process.env.CAS_URL
export const AMPLITUDE_TOKEN = process.env.AMPLITUDE_TOKEN

export const SENTRY_DSN = process.env.LIGRETTO_FRONTEND_SENTRY_DSN
export const SENTRY_ENV = process.env.LIGRETTO_APP_ENV || 'production'
export const APP_VERSION = process.env.LIGRETTO_APP_VERSION
