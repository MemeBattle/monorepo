// The internal token is wired under workerd: the Worker composes the token list from its secret binding and the
// internal app refuses a request without it, on the hostname and through the service binding. The authenticated
// path needs a migrated database, which the smoke job does not have; the PGlite HTTP suite covers it.
import { env, exports } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'

const worker = (exports as unknown as { default: Fetcher }).default
const internalBinding = (env as unknown as { INTERNAL: Fetcher }).INTERNAL

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

  it('keeps the internal routes off the public hostname', async () => {
    const res = await worker.fetch('http://localhost/internal/games', { method: 'POST' })
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'not_found' })
  })
})
