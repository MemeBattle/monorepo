import * as Sentry from '@sentry/browser'
import { captureConsoleIntegration } from '@sentry/integrations'

import { SENTRY_DSN, SENTRY_ENV, IS_DEV_MODE, APP_VERSION } from '#shared/constants/config'

Sentry.init({
  dsn: SENTRY_DSN,
  maxBreadcrumbs: 50,
  debug: IS_DEV_MODE,
  environment: SENTRY_ENV,
  release: APP_VERSION,
  integrations: [
    captureConsoleIntegration({ levels: ['error', 'warn'] }),
    Sentry.browserTracingIntegration({
      instrumentNavigation: false,
      instrumentPageLoad: false,
    }),
  ],
  tracePropagationTargets: ['localhost', '127.0.0.1', /^https:\/\/(core|api)\.ligretto\.app/, /^https:\/\/cas\.mems\.fun/],
  tracesSampleRate: 1,
})
