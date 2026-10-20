import { describe, expect, it, vi } from 'vitest'
import { ApiError, atUrl, client, createClient } from './client'
import type { Client, RequestConfig } from './client'
import { token } from './generated/operations/token'
import { userinfoByGet } from './generated/operations/userinfoByGet'

const BASE_URL = 'https://cas.example'

/** A `fetch` that answers every request with `response`, recording what it was called with. */
const stub = (response: () => Response) => vi.fn<typeof globalThis.fetch>().mockImplementation(async () => response())

const json = (status: number, body: unknown, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })

/** What the stub was called with, as the pieces a test asserts on. */
const sent = (fetch: ReturnType<typeof stub>, call = 0) => {
  const [input, init] = fetch.mock.calls[call]
  return { url: String(input), init: init as RequestInit, headers: new Headers(init?.headers) }
}

describe('createClient', () => {
  it('resolves a path of the description against the base URL and never follows a redirect', async () => {
    const fetch = stub(() => json(200, { keys: [] }))
    await createClient({ baseUrl: BASE_URL, fetch })({ method: 'GET', url: '/oidc/jwks.json' })

    expect(sent(fetch).url).toBe('https://cas.example/oidc/jwks.json')
    expect(sent(fetch).init.redirect).toBe('manual')
  })

  it('throws a redirect rather than following it', async () => {
    const fetch = stub(() => new Response(null, { status: 302, headers: { Location: 'https://elsewhere.example' } }))
    const call = createClient({ baseUrl: BASE_URL, fetch })({ method: 'GET', url: '/oidc/authorize' })

    await expect(call).rejects.toMatchObject({ name: 'ApiError', code: 'redirect_refused', status: 302 })
  })

  it('throws an opaque redirect, which is how a browser-like runtime reports one', async () => {
    const opaque = new Response(null, { status: 200 })
    Object.defineProperty(opaque, 'type', { value: 'opaqueredirect' })
    const fetch = stub(() => opaque)
    const call = createClient({ baseUrl: BASE_URL, fetch })({ method: 'GET', url: '/oidc/authorize' })

    await expect(call).rejects.toBeInstanceOf(ApiError)
  })

  it('returns a declared 4xx with its OIDC code as a value', async () => {
    const fetch = stub(() => json(400, { error: 'invalid_grant', error_description: 'The code has been used' }))
    const result = await createClient({ baseUrl: BASE_URL, fetch })({ method: 'POST', url: '/oidc/token', body: 'grant_type=authorization_code' })

    expect(result).toEqual({ ok: false, error: { status: 400, code: 'invalid_grant', message: 'The code has been used' } })
  })

  it('throws a 5xx and a body it cannot read', async () => {
    const serverError = createClient({
      baseUrl: BASE_URL,
      fetch: stub(() => json(503, { error: 'temporarily_unavailable', error_description: 'Try later' })),
    })
    await expect(serverError({ method: 'GET', url: '/oidc/userinfo' })).rejects.toMatchObject({ code: 'temporarily_unavailable', status: 503 })

    const unreadable = createClient({ baseUrl: BASE_URL, fetch: stub(() => new Response('<html>no</html>', { status: 400 })) })
    await expect(unreadable({ method: 'GET', url: '/oidc/authorize' })).rejects.toMatchObject({ code: 'unknown', status: 400 })
  })

  it('JSON-encodes a body that is not a string', async () => {
    const fetch = stub(() => json(200, {}))
    await createClient({ baseUrl: BASE_URL, fetch })({ method: 'POST', url: '/oidc/userinfo', body: { hint: 'none' } })

    expect(sent(fetch).headers.get('content-type')).toBe('application/json')
    expect(sent(fetch).init.body).toBe('{"hint":"none"}')
  })

  it('lets a caller header win over the content type the body encoding would set', async () => {
    const fetch = stub(() => json(200, {}))
    await createClient({ baseUrl: BASE_URL, fetch })({ method: 'POST', url: '/oidc/token', body: 'a=b', headers: { 'Content-Type': 'text/plain' } })

    expect(sent(fetch).headers.get('content-type')).toBe('text/plain')
  })
})

describe('the default client', () => {
  it('refuses to guess a CAS and says how to make one', () => {
    expect(() => client({ method: 'GET', url: '/oidc/jwks.json' })).toThrow(/createClient/)
  })
})

describe('atUrl', () => {
  it('sends the request to the absolute URL and keeps every other field', async () => {
    const seen: RequestConfig[] = []
    const wrapped: Client = async config => {
      seen.push(config)
      return { ok: true, status: 200, headers: new Headers(), data: undefined }
    }

    await atUrl(wrapped, 'https://cas.example/path/keys')({ method: 'POST', url: '/oidc/jwks.json', body: 'a=b', headers: { 'X-Test': 'yes' } })

    expect(seen).toEqual([{ method: 'POST', url: 'https://cas.example/path/keys', body: 'a=b', headers: { 'X-Test': 'yes' } }])
  })
})

describe('the generated operations', () => {
  it('round-trips the token endpoint: the form body verbatim, the Basic header typed, the response headers readable', async () => {
    const body = 'grant_type=authorization_code&code=abc&redirect_uri=https%3A%2F%2Fapp.example%2Fcb&code_verifier=v'
    const fetch = stub(() =>
      json(
        200,
        { access_token: 'at', expires_in: 600, id_token: 'id', refresh_token: 'rt', scope: 'openid', token_type: 'Bearer' },
        { 'Cache-Control': 'no-store' },
      ),
    )

    const result = await token({
      client: createClient({ baseUrl: BASE_URL, fetch }),
      body,
      headers: { Authorization: 'Basic bGlncmV0dG86c2VjcmV0' },
    })

    const request = sent(fetch)
    expect(request.url).toBe('https://cas.example/oidc/token')
    expect(request.init.method).toBe('POST')
    expect(request.headers.get('content-type')).toBe('application/x-www-form-urlencoded')
    expect(request.headers.get('authorization')).toBe('Basic bGlncmV0dG86c2VjcmV0')
    // The form body goes on the wire as given, never quoted into JSON.
    expect(request.init.body).toBe(body)

    expect(result.ok && result.data.access_token).toBe('at')
    expect(result.ok && result.headers.get('cache-control')).toBe('no-store')
  })

  it('authenticates userinfo with a Bearer header, which the spec declares as a security scheme and not a parameter', async () => {
    const fetch = stub(() => json(200, { sub: '8f14e45f-ceea-467a-9a1c-7f5a2a1cc001', account_type: 'full' }))

    const result = await userinfoByGet({ client: createClient({ baseUrl: BASE_URL, fetch }), headers: { Authorization: 'Bearer at' } })

    expect(sent(fetch).url).toBe('https://cas.example/oidc/userinfo')
    expect(sent(fetch).headers.get('authorization')).toBe('Bearer at')
    expect(result.ok && result.data.account_type).toBe('full')
  })

  it('hands a declared failure of the token endpoint back as a value with its code', async () => {
    const fetch = stub(() => json(401, { error: 'invalid_client', error_description: 'Unknown client' }))

    const result = await token({ client: createClient({ baseUrl: BASE_URL, fetch }), body: 'grant_type=refresh_token&refresh_token=r' })

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error.code).toBe('invalid_client')
  })
})
