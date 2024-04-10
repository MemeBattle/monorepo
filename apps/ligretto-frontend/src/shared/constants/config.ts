export const IS_DEV_MODE = import.meta.env?.DEV

export const LIGRETTO_CORE_URL = process.env.LIGRETTO_CORE_URL

export const LIGRETTO_GAMEPLAY_URL = process.env.LIGRETTO_GAMEPLAY_URL
export const CAS_STATIC_URL = process.env.CAS_STATIC_URL
export const CAS_URL = process.env.CAS_URL
export const AMPLITUDE_TOKEN = process.env.AMPLITUDE_TOKEN
export const CAS_PARTNER_ID = process.env.CAS_PARTNER_ID

export const SENTRY_DSN = process.env.LIGRETTO_FRONTEND_SENTRY_DSN
export const SENTRY_ENV = process.env.LIGRETTO_APP_ENV || 'production'
export const APP_VERSION = process.env.LIGRETTO_APP_VERSION
