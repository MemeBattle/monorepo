import { describe, expect, it } from 'vitest'

import { createFixedClock } from '../core/ports/clock.fake.ts'
import { okProbe } from '../core/ports/database-probe.fake.ts'
import { createRecordingLogger } from '../core/ports/logger.fake.ts'
import { createBaseApp } from './app.ts'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

const setup = () => {
  const { logger, entries } = createRecordingLogger()
  const clock = createFixedClock(1000)
  const app = createBaseApp({ logger, clock, database: okProbe() })
  app.get('/slow', c => {
    clock.advance(12)
    return c.text('done', 201)
  })
  const requestLines = () => entries.filter(entry => entry.message === 'request')
  return { app, requestLines }
}

describe('the request log', () => {
  it('writes one info line per request, without the query string', async () => {
    const { app, requestLines } = setup()
    const res = await app.request('/slow?secret=1')
    const requestId = res.headers.get('x-request-id')
    expect(requestLines()).toEqual([
      { level: 'info', message: 'request', fields: { requestId, method: 'GET', path: '/slow', status: 201, durationMs: 12 } },
    ])
  })

  it('logs the status of a refusal', async () => {
    const { app, requestLines } = setup()
    await app.request('/missing')
    expect(requestLines()[0]?.fields).toMatchObject({ path: '/missing', status: 404 })
  })
})

describe('the request id', () => {
  it('is cf-ray when present', async () => {
    const { app, requestLines } = setup()
    const res = await app.request('/slow', { headers: { 'cf-ray': 'ray-1', 'x-request-id': 'proxy-1' } })
    expect(res.headers.get('x-request-id')).toBe('ray-1')
    expect(requestLines()[0]?.fields.requestId).toBe('ray-1')
  })

  it('is x-request-id when there is no cf-ray', async () => {
    const { app } = setup()
    const res = await app.request('/slow', { headers: { 'x-request-id': 'proxy-1' } })
    expect(res.headers.get('x-request-id')).toBe('proxy-1')
  })

  it('is generated otherwise', async () => {
    const { app, requestLines } = setup()
    const res = await app.request('/slow')
    const requestId = res.headers.get('x-request-id')
    expect(requestId).toMatch(UUID)
    expect(requestLines()[0]?.fields.requestId).toBe(requestId)
  })
})
