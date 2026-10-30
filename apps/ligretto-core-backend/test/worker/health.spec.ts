// The Worker smoke suite: the entry of cloudflare.config.ts under workerd. It proves the wiring (dispatch by
// hostname, the service-binding entrypoint), not behaviour, which the Node suites cover. Both apps answer /health alike,
// so CORS tells them apart: only the public app echoes an allowed Origin (cloudflare.config.ts allows this one).
import { env, exports } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'

/** The Worker's own default export, as a fetcher. */
const worker = (exports as unknown as { default: Fetcher }).default
/** The service binding to the `InternalApi` entrypoint, declared in vitest.worker.config.ts. */
const internalBinding = (env as unknown as { INTERNAL: Fetcher }).INTERNAL

const ORIGIN = 'http://localhost:5173'
const withOrigin = { headers: { origin: ORIGIN } }

/** The CORS headers of a response; the internal app sets none. */
const corsHeaders = (res: Response) => [...res.headers.keys()].filter(name => name.startsWith('access-control-'))

describe('the Worker', () => {
  it('answers /health on the public hostname', async () => {
    const res = await worker.fetch('http://localhost/health', withOrigin)
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ status: 'ok' })
    expect(res.headers.get('x-request-id')).toBeTruthy()
    expect(res.headers.get('access-control-allow-origin')).toBe(ORIGIN)
  })

  it('answers /health on the internal hostname', async () => {
    const res = await worker.fetch('http://internal.localhost/health', withOrigin)
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ status: 'ok' })
    expect(corsHeaders(res)).toEqual([])
  })

  it('answers an unknown route on the public hostname with 404', async () => {
    const res = await worker.fetch('http://localhost/api/nope')
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'not_found' })
  })

  it('refuses a foreign hostname', async () => {
    const res = await worker.fetch('http://other.example/health')
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'unknown_host' })
  })

  it('answers /health through the InternalApi service binding', async () => {
    const res = await internalBinding.fetch('http://internal.localhost/health', withOrigin)
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ status: 'ok' })
    expect(corsHeaders(res)).toEqual([])
  })
})
