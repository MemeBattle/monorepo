import { createRoute } from '@hono/zod-openapi'
import { HTTPException } from 'hono/http-exception'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { createFixedClock } from '../core/ports/clock.fake.ts'
import { okProbe } from '../core/ports/database-probe.fake.ts'
import { createRecordingLogger } from '../core/ports/logger.fake.ts'
import { createBaseApp } from './app.ts'

const setup = () => {
  const { logger, entries } = createRecordingLogger()
  const app = createBaseApp({ logger, clock: createFixedClock(), database: okProbe() })

  app.openapi(
    createRoute({
      method: 'get',
      path: '/query',
      request: { query: z.object({ n: z.coerce.number() }) },
      responses: { 200: { description: 'ok' } },
    }),
    c => c.body(null, 200),
  )
  app.openapi(
    createRoute({
      method: 'post',
      path: '/json',
      request: { body: { content: { 'application/json': { schema: z.object({ name: z.string() }) } } } },
      responses: { 200: { description: 'ok' } },
    }),
    c => c.body(null, 200),
  )
  app.get('/boom', () => {
    throw new Error('boom')
  })
  app.get('/http/:status', c => {
    const status = Number(c.req.param('status')) as ContentfulStatusCode
    throw new HTTPException(status, { message: c.req.query('message') })
  })

  const errorEntries = () => entries.filter(entry => entry.level === 'error')
  const warnEntries = () => entries.filter(entry => entry.level === 'warn')
  return { app, entries, errorEntries, warnEntries }
}

describe('the validation hook', () => {
  it('answers a schema rejection as 400 validation_failed with the issues, and logs no error', async () => {
    const { app, errorEntries } = setup()
    const res = await app.request('/query?n=abc')
    expect(res.status).toBe(400)
    const body = (await res.json()) as { issues: { path: string }[] }
    expect(body).toMatchObject({ error: 'validation_failed', description: 'The request does not match the route schema' })
    expect(body.issues[0].path).toBe('n')
    expect(errorEntries()).toEqual([])
  })
})

describe('the error handler', () => {
  it('answers an unparsable body as 400 validation_failed, and logs no error', async () => {
    const { app, errorEntries } = setup()
    const res = await app.request('/json', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{' })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'validation_failed', description: 'Malformed JSON in request body', issues: [] })
    expect(errorEntries()).toEqual([])
  })

  it('answers an unexpected throw as the one 500 with the request id, logged once at error', async () => {
    const { app, errorEntries } = setup()
    const res = await app.request('/boom')
    expect(res.status).toBe(500)
    const requestId = res.headers.get('x-request-id')
    expect(requestId).toBeTruthy()
    expect(await res.json()).toEqual({ error: 'internal_error', description: 'Unexpected failure', requestId })
    expect(errorEntries()).toHaveLength(1)
    expect(errorEntries()[0]).toMatchObject({
      message: 'request_failed',
      fields: { requestId, status: 500, error: 'internal_error', errorMessage: 'boom' },
    })
    expect(errorEntries()[0]?.fields.stack).toEqual(expect.stringContaining('boom'))
  })

  it.each([
    [404, 'not_found'],
    [401, 'unauthorized'],
    [418, 'request_rejected'],
  ])('keeps the status of HTTPException(%i) with the code %s, and logs no error', async (status, code) => {
    const { app, errorEntries } = setup()
    const res = await app.request(`/http/${status}`)
    expect(res.status).toBe(status)
    expect(await res.json()).toEqual({ error: code })
    expect(errorEntries()).toEqual([])
  })

  it('keeps a 503 with its message and logs it once at error with the code and the stack', async () => {
    const { app, errorEntries } = setup()
    const res = await app.request('/http/503?message=database%20down')
    expect(res.status).toBe(503)
    const requestId = res.headers.get('x-request-id')
    expect(await res.json()).toEqual({ error: 'service_unavailable', description: 'database down' })
    expect(errorEntries()).toHaveLength(1)
    expect(errorEntries()[0]?.fields).toMatchObject({ requestId, status: 503, error: 'service_unavailable' })
    expect(errorEntries()[0]?.fields.stack).toEqual(expect.any(String))
  })

  it('keeps a 502 as bad_gateway, logged once at error', async () => {
    const { app, errorEntries } = setup()
    const res = await app.request('/http/502')
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ error: 'bad_gateway' })
    expect(errorEntries()).toHaveLength(1)
    expect(errorEntries()[0]?.fields).toMatchObject({ status: 502, error: 'bad_gateway' })
  })

  it('treats a deliberate HTTPException(500) as the unhandled failure', async () => {
    const { app, errorEntries } = setup()
    const res = await app.request('/http/500')
    expect(res.status).toBe(500)
    const requestId = res.headers.get('x-request-id')
    expect(await res.json()).toEqual({ error: 'internal_error', description: 'Unexpected failure', requestId })
    expect(errorEntries()).toHaveLength(1)
    expect(errorEntries()[0]?.fields).toMatchObject({ requestId, status: 500, error: 'internal_error' })
  })

  it('answers an unknown route as 404 not_found, and logs no error', async () => {
    const { app, errorEntries } = setup()
    const res = await app.request('/missing')
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'not_found' })
    expect(errorEntries()).toEqual([])
  })

  it('never logs at warn', async () => {
    const { app, warnEntries } = setup()
    for (const path of ['/query?n=abc', '/boom', '/http/404', '/http/418', '/http/500', '/http/502', '/http/503', '/missing']) {
      await app.request(path)
    }
    expect(warnEntries()).toEqual([])
  })
})
