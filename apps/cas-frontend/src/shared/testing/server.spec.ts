import { expect, it } from 'vitest'
import { server } from './server'
import { assertNoUnhandledRequests } from './runtime'

it('blocks and records each unanswered request once without relying on lifecycle events', async () => {
  await expect(fetch('/api/unanswered-ledger')).rejects.toThrow()
  // MSW versions differ in whether the event precedes the throwing error strategy.
  server.events.removeAllListeners('request:unhandled')
  await expect(fetch('/api/unanswered-ledger')).rejects.toThrow()

  const message = 'Unhandled CAS request: GET http://localhost:3000/api/unanswered-ledger. Declare an entity testing helper.'
  expect(() => assertNoUnhandledRequests()).toThrow(new Error(`${message}\n${message}`))
  expect(() => assertNoUnhandledRequests()).not.toThrow()
})
