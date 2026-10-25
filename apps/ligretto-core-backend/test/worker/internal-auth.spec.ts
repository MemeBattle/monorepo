// The internal token is wired under workerd: the Worker composes the token list from its secret binding, so the
// internal app accepts the token of .dev.vars and refuses a request without it, on the hostname and through the
// service binding. An accepted token is shown without a migrated database: a save-round with an empty body is
// refused by the request validator, which runs after the guard and before any query. The PGlite HTTP suite covers
// the routes' behaviour.
import { env, exports } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'

const worker = (exports as unknown as { default: Fetcher }).default
const internalBinding = (env as unknown as { INTERNAL: Fetcher }).INTERNAL
const devToken = (env as unknown as { LIGRETTO_INTERNAL_API_TOKEN: string }).LIGRETTO_INTERNAL_API_TOKEN

/** A save-round the guard lets through and the validator refuses: `400` proves the token was accepted. */
const acceptedTokenProbe = (fetcher: Fetcher) =>
  fetcher.fetch(`http://internal.localhost/internal/games/${crypto.randomUUID()}/rounds`, {
    method: 'POST',
    headers: { authorization: `Bearer ${devToken}`, 'content-type': 'application/json' },
    body: '{}',
  })

const corsHeaders = (res: Response) => [...res.headers.keys()].filter(name => name.startsWith('access-control-'))

describe('the internal token', () => {
  it('refuses POST /internal/games without it on the internal hostname', async () => {
    const res = await worker.fetch('http://internal.localhost/internal/games', { method: 'POST', headers: { origin: 'http://localhost:5173' } })
    expect(res.status).toBe(401)
    expect(await res.json()).toMatchObject({ error: 'invalid_internal_token' })
    expect(corsHeaders(res)).toEqual([])
  })

  it('refuses a wrong token through the InternalApi service binding', async () => {
    const res = await internalBinding.fetch('http://internal.localhost/internal/games', {
      method: 'POST',
      headers: { authorization: 'Bearer wrong' },
    })
    expect(res.status).toBe(401)
    expect(await res.json()).toMatchObject({ error: 'invalid_internal_token' })
  })

  it('accepts the configured token on the internal hostname', async () => {
    const res = await acceptedTokenProbe(worker)
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: 'validation_failed' })
  })

  it('accepts the configured token through the InternalApi service binding', async () => {
    const res = await acceptedTokenProbe(internalBinding)
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: 'validation_failed' })
  })

  it('keeps the internal routes off the public hostname', async () => {
    const res = await worker.fetch('http://localhost/internal/games', { method: 'POST' })
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'not_found' })
  })
})
