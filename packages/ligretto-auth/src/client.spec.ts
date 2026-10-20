import { describe, expect, expectTypeOf, it, vi } from 'vitest'
import { ApiError, atUrl, client, createClient } from './client'
import type { Client, ErrorCodeOf, RequestConfig } from './client'
import type { AuthorizeResponses } from './generated/models/Authorize'
import type { TokenResponses } from './generated/models/Token'
import { endSessionByForm } from './generated/operations/endSessionByForm'
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

  it('appends the path to a base URL that carries a path of its own, as a path-bearing issuer does', async () => {
    const fetch = stub(() => json(200, { keys: [] }))
    await createClient({ baseUrl: 'https://cas.example/path', fetch })({ method: 'GET', url: '/oidc/jwks.json' })

    // `new URL('/oidc/jwks.json', 'https://cas.example/path')` would answer `https://cas.example/oidc/jwks.json`.
    expect(sent(fetch).url).toBe('https://cas.example/path/oidc/jwks.json')
  })

  it('sends an absolute URL as it stands, whatever path the base URL carries', async () => {
    const fetch = stub(() => json(200, { keys: [] }))
    const cas = createClient({ baseUrl: 'https://cas.example/path', fetch })
    await atUrl(cas, 'https://keys.example/jwks')({ method: 'GET', url: '/oidc/jwks.json' })

    expect(sent(fetch).url).toBe('https://keys.example/jwks')
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

    expect(result).toMatchObject({ ok: false, error: { status: 400, code: 'invalid_grant', message: 'The code has been used' } })
  })

  it('keeps the response headers on a declared failure, so a `429` can prescribe the wait', async () => {
    const fetch = stub(() => json(429, { error: 'rate_limit_exceeded', error_description: 'Slow down' }, { 'Retry-After': '60' }))
    const result = await createClient({ baseUrl: BASE_URL, fetch })({ method: 'POST', url: '/oidc/token', body: 'grant_type=x' })

    expect(!result.ok && result.error.code).toBe('rate_limit_exceeded')
    expect(!result.ok && result.error.headers.get('retry-after')).toBe('60')
  })

  it('returns a 5xx with its code as a value, the response headers on it', async () => {
    const fetch = stub(() => json(503, { error: 'temporarily_unavailable', error_description: 'Try later' }, { 'Retry-After': '5' }))
    const result = await createClient({ baseUrl: BASE_URL, fetch })({ method: 'GET', url: '/oidc/userinfo' })

    expect(result).toMatchObject({ ok: false, error: { status: 503, code: 'temporarily_unavailable', message: 'Try later' } })
    expect(!result.ok && result.error.headers.get('retry-after')).toBe('5')
  })

  it('returns the envelope of an internal error as a value with its code', async () => {
    const fetch = stub(() => json(500, { error: { code: 'internal_error', message: 'Something broke' } }))
    const result = await createClient({ baseUrl: BASE_URL, fetch })({ method: 'POST', url: '/oidc/token', body: 'grant_type=x' })

    expect(result).toMatchObject({ ok: false, error: { status: 500, code: 'internal_error', message: 'Something broke' } })
  })

  it('throws an error response whose body carries no code, which is a proxy talking rather than CAS', async () => {
    for (const status of [400, 502]) {
      const fetch = stub(() => new Response('<html>no</html>', { status, headers: { 'Retry-After': '5' } }))
      const thrown: unknown = await createClient({ baseUrl: BASE_URL, fetch })({ method: 'GET', url: '/oidc/userinfo' }).catch(
        (error: unknown) => error,
      )

      expect(thrown).toBeInstanceOf(ApiError)
      expect(thrown).toMatchObject({ code: 'unknown', status })
      expect(thrown instanceof ApiError && thrown.headers.get('retry-after')).toBe('5')
    }
  })

  it('throws a network failure as an `ApiError` with the rejection as its cause', async () => {
    const cause = new TypeError('fetch failed')
    const fetch = vi.fn<typeof globalThis.fetch>().mockRejectedValue(cause)
    const thrown: unknown = await createClient({ baseUrl: BASE_URL, fetch })({ method: 'GET', url: '/oidc/userinfo' }).catch(
      (error: unknown) => error,
    )

    // A caller mapping known failures to statuses of its own has nothing to recognise a bare `TypeError` by, and
    // would answer a routine outage with a 500.
    expect(thrown).toBeInstanceOf(ApiError)
    expect(thrown).toMatchObject({ code: 'unreachable', status: 0, cause })
  })

  it('throws an `ApiError` for a 2xx whose body is not JSON, as an interstitial page answers', async () => {
    const fetch = stub(() => new Response('<html>sign in here</html>', { status: 200, headers: { 'Content-Type': 'text/html' } }))
    const call = createClient({ baseUrl: BASE_URL, fetch })({ method: 'GET', url: '/oidc/userinfo' })

    await expect(call).rejects.toMatchObject({ name: 'ApiError', code: 'unknown', status: 200 })
  })

  it('form-encodes an object body when the operation declares a form, an omitted optional left out', async () => {
    const fetch = stub(() => json(200, {}))
    await createClient({ baseUrl: BASE_URL, fetch })({
      method: 'POST',
      url: '/oidc/token',
      body: { grant_type: 'refresh_token', refresh_token: 'r', scope: undefined },
      contentType: { request: 'application/x-www-form-urlencoded' },
    })

    expect(sent(fetch).headers.get('content-type')).toBe('application/x-www-form-urlencoded')
    // An optional parameter the caller left out is absent from the form, never the string `undefined`.
    expect(sent(fetch).init.body).toBe('grant_type=refresh_token&refresh_token=r')
  })

  it('JSON-encodes a body that is not a string', async () => {
    const fetch = stub(() => json(200, {}))
    await createClient({ baseUrl: BASE_URL, fetch })({ method: 'POST', url: '/oidc/userinfo', body: { hint: 'none' } })

    expect(sent(fetch).headers.get('content-type')).toBe('application/json')
    expect(sent(fetch).init.body).toBe('{"hint":"none"}')
  })

  it('lets a caller header win over the content type the body encoding would set, however it is spelled', async () => {
    // HTTP header names are case-insensitive, so every spelling must replace the computed header rather than join a
    // second value to it: `Content-Type: text/plain, application/x-www-form-urlencoded` passes no content-type check.
    const contentTypeOf = async (name: string) => {
      const fetch = stub(() => json(200, {}))
      await createClient({ baseUrl: BASE_URL, fetch })({ method: 'POST', url: '/oidc/token', body: 'a=b', headers: { [name]: 'text/plain' } })
      return sent(fetch).headers.get('content-type')
    }

    await expect(contentTypeOf('Content-Type')).resolves.toBe('text/plain')
    await expect(contentTypeOf('content-type')).resolves.toBe('text/plain')
    await expect(contentTypeOf('CONTENT-TYPE')).resolves.toBe('text/plain')
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
  it('round-trips the token endpoint: the grant as a form, the Basic header typed, the response headers readable', async () => {
    const fetch = stub(() =>
      json(
        200,
        { access_token: 'at', expires_in: 600, id_token: 'id', refresh_token: 'rt', scope: 'openid', token_type: 'Bearer' },
        { 'Cache-Control': 'no-store' },
      ),
    )

    const result = await token({
      client: createClient({ baseUrl: BASE_URL, fetch }),
      body: { grant_type: 'authorization_code', code: 'abc', redirect_uri: 'https://app.example/cb', code_verifier: 'v' },
      headers: { Authorization: 'Basic bGlncmV0dG86c2VjcmV0' },
    })

    const request = sent(fetch)
    expect(request.url).toBe('https://cas.example/oidc/token')
    expect(request.init.method).toBe('POST')
    expect(request.headers.get('content-type')).toBe('application/x-www-form-urlencoded')
    expect(request.headers.get('authorization')).toBe('Basic bGlncmV0dG86c2VjcmV0')
    // The grant goes on the wire as the form the operation declares, its properties in the order they were written,
    // never quoted into JSON.
    expect(request.init.body).toBe('grant_type=authorization_code&code=abc&redirect_uri=https%3A%2F%2Fapp.example%2Fcb&code_verifier=v')

    expect(result.ok && result.data.access_token).toBe('at')
    expect(result.ok && result.headers.get('cache-control')).toBe('no-store')
    // `expires_in` is the JSON number the transport delivers, so expiry arithmetic works on it as it stands: were it
    // typed as a `bigint` — kubb's default for `format: int64` — this line would not compile and would throw if it did.
    expect(result.ok && result.data.expires_in * 1000).toBe(600_000)
  })

  it('sends the string body of the end-session form verbatim, the one form body the description still types as a string', async () => {
    const fetch = stub(() => new Response(null, { status: 302, headers: { Location: 'https://app.example/' } }))
    const body = 'id_token_hint=the-id-token&post_logout_redirect_uri=https%3A%2F%2Fapp.example%2F'

    const call = endSessionByForm({ client: createClient({ baseUrl: BASE_URL, fetch }), body })

    // Where the navigation goes is the caller's business; what this case proves is the request that was sent.
    await expect(call).rejects.toMatchObject({ name: 'ApiError', code: 'redirect_refused' })
    expect(sent(fetch).headers.get('content-type')).toBe('application/x-www-form-urlencoded')
    expect(sent(fetch).init.body).toBe(body)
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

    const result = await token({ client: createClient({ baseUrl: BASE_URL, fetch }), body: { grant_type: 'refresh_token', refresh_token: 'r' } })

    expect(result.ok).toBe(false)
    expect(!result.ok && result.error.code).toBe('invalid_client')
  })

  it('types the codes of every 4xx and 5xx the operation declares, both error shapes of a `500` included', async () => {
    const fetch = stub(() => json(500, { error: { code: 'internal_error', message: 'Something broke' } }))

    const result = await token({ client: createClient({ baseUrl: BASE_URL, fetch }), body: { grant_type: 'refresh_token', refresh_token: 'r' } })

    expect(!result.ok && result.error.code).toBe('internal_error')
    expectTypeOf<ErrorCodeOf<TokenResponses>>().toEqualTypeOf<
      | 'invalid_grant'
      | 'invalid_request'
      | 'invalid_scope'
      | 'unauthorized_client'
      | 'unsupported_grant_type'
      | 'invalid_client'
      | 'rate_limit_exceeded'
      | 'server_error'
      | 'internal_error'
      | 'temporarily_unavailable'
    >()
    // A status kubb describes per content type yields the codes of its JSON variant; the HTML pages carry none.
    expectTypeOf<ErrorCodeOf<AuthorizeResponses>>().toEqualTypeOf<'internal_error'>()
  })
})
