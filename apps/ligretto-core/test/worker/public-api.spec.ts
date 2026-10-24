// The public API under workerd: proof that the Worker composes the auth handlers, the users route and the document
// from the bindings of cloudflare.config.ts. None of these requests needs CAS or a database row: the users route
// refuses before any query, and a logout without a session goes straight back to the application.
import { exports } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'

/** The Worker's own default export, as a fetcher. */
const worker = (exports as unknown as { default: Fetcher }).default

describe('the public API on the Worker', () => {
  it('refuses /api/users without an access token', async () => {
    const res = await worker.fetch('http://localhost/api/users?ids=someone')
    expect(res.status).toBe(401)
    expect(await res.json()).toMatchObject({ error: 'unauthorized' })
  })

  it('sends a logout without a session back to the configured application', async () => {
    const res = await worker.fetch('http://localhost/api/auth/logout', { redirect: 'manual' })
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('http://localhost:5174/')
  })

  it('serves the public document', async () => {
    const res = await worker.fetch('http://localhost/openapi.json')
    expect(res.status).toBe(200)
    const document: { paths: Record<string, unknown> } = await res.json()
    expect(Object.keys(document.paths)).toContain('/api/users')
  })

  it('does not serve /api/users on the internal hostname', async () => {
    const res = await worker.fetch('http://internal.localhost/api/users?ids=someone')
    expect(res.status).toBe(404)
  })
})
