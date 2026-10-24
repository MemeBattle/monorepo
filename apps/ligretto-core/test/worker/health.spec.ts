// The Worker smoke suite: the entry of cloudflare.config.ts under workerd. It proves the wiring (dispatch by
// hostname, the service-binding entrypoint), not behaviour, which the Node suites cover.
import { env, exports } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'

/** The Worker's own default export, as a fetcher. */
const worker = (exports as unknown as { default: Fetcher }).default
/** The service binding to the `InternalApi` entrypoint, declared in vitest.worker.config.ts. */
const internalBinding = (env as unknown as { INTERNAL: Fetcher }).INTERNAL

describe('the Worker', () => {
  it('answers /health on the public hostname', async () => {
    const res = await worker.fetch('http://localhost/health')
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ status: 'ok' })
    expect(res.headers.get('x-request-id')).toBeTruthy()
  })

  it('answers /health on the internal hostname', async () => {
    const res = await worker.fetch('http://internal.localhost/health')
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ status: 'ok' })
  })

  it('refuses a foreign hostname', async () => {
    const res = await worker.fetch('http://other.example/health')
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'unknown_host' })
  })

  it('answers /health through the InternalApi service binding', async () => {
    const res = await internalBinding.fetch('http://internal.localhost/health')
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ status: 'ok' })
  })
})
