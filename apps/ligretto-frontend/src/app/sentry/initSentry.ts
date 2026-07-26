import * as Sentry from '@sentry/browser'

import { SENTRY_DSN, SENTRY_ENV, APP_VERSION } from '#shared/constants/config'

Sentry.init({
  dsn: SENTRY_DSN,
  maxBreadcrumbs: 50,
  debug: false,
  environment: SENTRY_ENV,
  release: APP_VERSION,
  integrations: [Sentry.captureConsoleIntegration({ levels: ['error', 'warn'] })],
})
