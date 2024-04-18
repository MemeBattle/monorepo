import * as Sentry from '@sentry/node'
import { nodeProfilingIntegration } from '@sentry/profiling-node'

Sentry.init({
  dsn: 'https://b9952c3fe0699ed45d67525f493b5b62@o1040475.ingest.us.sentry.io/4507005403725824',
  integrations: [nodeProfilingIntegration()],
  // Performance Monitoring
  tracesSampleRate: 1.0, //  Capture 100% of the transactions
  // Set sampling rate for profiling - this is relative to tracesSampleRate
  profilesSampleRate: 1.0,
  debug: true,
})

// setTimeout(() => {
//   Sentry.startSpan({ name: 'test' }, () => {
//     Sentry.startSpan({ name: 'tnested-test', op: 'mark.fn' }, () => {
//       console.log('test')
//     })
//   })
// }, 1000)
