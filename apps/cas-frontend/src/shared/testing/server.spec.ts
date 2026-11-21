import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
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

it('keeps an unanswered request off a server that is listening', async () => {
  let reached = 0
  const listening = createServer((_request, response) => {
    reached += 1
    response.writeHead(404).end()
  })
  await new Promise<void>(resolve => listening.listen(0, '127.0.0.1', resolve))
  const url = `http://127.0.0.1:${(listening.address() as AddressInfo).port}/api/unanswered-live`
  try {
    await expect(fetch(url)).rejects.toThrow()
  } finally {
    await new Promise(resolve => listening.close(resolve))
  }

  expect(reached).toBe(0)
  expect(() => assertNoUnhandledRequests()).toThrow(new Error(`Unhandled CAS request: GET ${url}. Declare an entity testing helper.`))
})
