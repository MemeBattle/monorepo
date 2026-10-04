import { expect, test } from '@playwright/test'

// The frontend's origin routes `/oidc` to CAS, as it does `/api`: `return_to`
// is an `/oidc/authorize` path on this origin (apps/cas ADR 0017 (h)). Without
// the proxy, vite would answer these paths with its own `index.html`.
test.describe('the /oidc proxy', () => {
  test('an authorization request without parameters reaches CAS and gets its error page', async ({ request }) => {
    const response = await request.get('/oidc/authorize')

    expect(response.status()).toBe(400)
    expect(response.headers()['content-type']).toBe('text/html; charset=utf-8')
    const page = await response.text()
    expect(page).toContain('<code>invalid_request</code>')
    expect(page).not.toContain('id="root"')
  })

  test('the published key set is served by CAS', async ({ request }) => {
    const response = await request.get('/oidc/jwks.json')

    expect(response.status()).toBe(200)
    expect(response.headers()['content-type']).toBe('application/json')
    const body = (await response.json()) as { keys: unknown }
    expect(Array.isArray(body.keys)).toBe(true)
  })
})
