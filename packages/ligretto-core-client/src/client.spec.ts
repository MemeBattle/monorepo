// The transport's rules (docs/adrs/api-contract-openapi-and-client-package.md of apps/ligretto-core) over a scripted
// `fetch`: what goes on the wire, and which result kind each answer becomes.
import { describe, expect, it, vi } from 'vitest'

import { client, createClient, type AnyResult, type ClientOptions, type RequestConfig } from './client'
import { getHealth, listUsers } from './index'

// No operation of either document declares a 204; one is added here so the rule can be shown.
vi.mock(import('./generated/declared-statuses'), async importOriginal => ({
  declaredStatuses: { ...(await importOriginal()).declaredStatuses, 'DELETE /test/no-content': [204] },
}))

interface Sent {
  url: string
  init: RequestInit
}

/** A client over a `fetch` that records what it was given and answers `answer`. */
const scripted = (
  answer: () => Response | Promise<Response> = () => json(200, []),
  options: Omit<ClientOptions, 'fetch'> = { baseUrl: 'https://h.example' },
) => {
  const sent: Sent[] = []
  const fetch: typeof globalThis.fetch = async (input, init = {}) => {
    sent.push({ url: String(input), init })
    return await answer()
  }
  return { request: createClient({ ...options, fetch }), sent, headersOf: (index = 0) => new Headers(sent[index]?.init.headers) }
}

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })

const users: RequestConfig = { method: 'GET', url: '/api/users', query: { ids: ['a'] } }
const rounds = (id = '0d3c2a84-1f4f-4c39-9a6a-5f6f9e0c1b2a'): RequestConfig => ({
  method: 'POST',
  url: '/internal/games/{id}/rounds',
  path: { id },
  body: { roundId: 'r', results: [] },
})

describe('the URL', () => {
  it.each(['https://h.example/base', 'https://h.example/base/', 'https://h.example/base//'])('appends the path to the base URL %s', async baseUrl => {
    const { request, sent } = scripted(undefined, { baseUrl })
    await request({ method: 'GET', url: '/api/users' })
    expect(sent[0].url).toBe('https://h.example/base/api/users')
  })

  it("is a same-origin relative URL for the base URL ''", async () => {
    const { request, sent } = scripted(undefined, { baseUrl: '' })
    await request({ method: 'GET', url: '/api/users' })
    expect(sent[0].url).toBe('/api/users')
  })

  it('substitutes and encodes a path parameter', async () => {
    const { request, sent } = scripted(() => json(200, {}))
    await request(rounds('a/b c'))
    expect(sent[0].url).toBe('https://h.example/internal/games/a%2Fb%20c/rounds')
  })

  it('refuses a missing path parameter, which the types prevent', async () => {
    const { request, sent } = scripted()
    await expect(request({ ...rounds(), path: {} })).rejects.toThrow(TypeError)
    expect(sent).toEqual([])
  })
})

describe('the query', () => {
  it.each([
    [{ ids: ['a', 'b'] }, '?ids=a&ids=b'],
    [{ ids: ['a'] }, '?ids=a'],
    [{ ids: ['a'], other: undefined }, '?ids=a'],
    [{ ids: [] }, ''],
    [{ ids: ['a b', 'c&d'] }, '?ids=a+b&ids=c%26d'],
  ])('serialises %j as %s', async (query, search) => {
    const { request, sent } = scripted()
    await request({ method: 'GET', url: '/api/users', query })
    expect(sent[0].url).toBe(`https://h.example/api/users${search}`)
  })
})

describe('the body and the headers', () => {
  it('sends a body as JSON with its content type', async () => {
    const { request, sent, headersOf } = scripted(() => json(200, {}))
    await request(rounds())
    expect(sent[0].init.body).toBe(JSON.stringify({ roundId: 'r', results: [] }))
    expect(headersOf().get('content-type')).toBe('application/json')
  })

  it('sends no content type without a body', async () => {
    const { request, headersOf } = scripted()
    await request(users)
    expect(headersOf().has('content-type')).toBe(false)
  })

  it("merges the client's headers, and a call's header overrides one of any letter case", async () => {
    const { request, headersOf } = scripted(undefined, { baseUrl: 'https://h.example', headers: { Authorization: 'Bearer default', 'x-one': '1' } })
    await request({ ...users, headers: { authorization: 'Bearer call' } })
    expect(headersOf().get('authorization')).toBe('Bearer call')
    expect(headersOf().get('x-one')).toBe('1')
  })
})

describe('the fetch options', () => {
  it('never follows a redirect', async () => {
    const { request, sent } = scripted()
    await request(users)
    expect(sent[0].init.redirect).toBe('manual')
  })

  it('forwards credentials and the signal', async () => {
    const { signal } = new AbortController()
    const { request, sent } = scripted(undefined, { baseUrl: 'https://h.example', credentials: 'include' })
    await request({ ...users, signal })
    expect(sent[0].init.credentials).toBe('include')
    expect(sent[0].init.signal).toBe(signal)
  })

  it('sends neither when none is given', async () => {
    const { request, sent } = scripted()
    await request(users)
    expect(sent[0].init).not.toHaveProperty('credentials')
    expect(sent[0].init).not.toHaveProperty('signal')
  })
})

describe('the result', () => {
  const answer = async (response: () => Response | Promise<Response>, config: RequestConfig = users): Promise<AnyResult> =>
    await scripted(response).request(config)

  it('is success for a declared 2xx, with its data, status and headers', async () => {
    const result = await answer(() => json(200, [{ sub: 'a' }], { 'x-request-id': 'r1' }))
    expect(result).toMatchObject({ kind: 'success', ok: true, status: 200, data: [{ sub: 'a' }] })
    expect(result.kind === 'success' && result.headers.get('x-request-id')).toBe('r1')
  })

  it('is success with undefined data for a declared 204', async () => {
    const result = await answer(() => new Response(null, { status: 204 }), { method: 'DELETE', url: '/test/no-content' })
    expect(result).toMatchObject({ kind: 'success', status: 204, data: undefined })
  })

  it('is error for a declared 4xx, with the whole body and the headers', async () => {
    const body = { error: 'unknown_players', description: 'These player ids have no user', playerIds: ['carol'] }
    const result = await answer(() => json(422, body, { 'retry-after': '30' }), rounds())
    expect(result).toMatchObject({ kind: 'error', ok: false, status: 422 })
    expect(result.kind === 'error' && result.error).toEqual(body)
    expect(result.kind === 'error' && result.headers.get('retry-after')).toBe('30')
  })

  it('keeps every field of an auth refusal, casError included', async () => {
    const body = { error: 'cas_unavailable', description: 'away', casError: 'unreachable' }
    const result = await answer(() => json(503, body), { method: 'GET', url: '/api/auth/me' })
    expect(result.kind === 'error' && result.error).toEqual(body)
  })

  it("is error with the whole HealthReport for GET /health's declared 503, which is no envelope", async () => {
    const report = { status: 'unavailable', checks: { database: { status: 'failed', durationMs: 3, error: 'down' } } }
    const result = await answer(() => json(503, report), { method: 'GET', url: '/health' })
    expect(result).toMatchObject({ kind: 'error', status: 503 })
    expect(result.kind === 'error' && result.error).toEqual(report)
  })

  it('is error for a declared 4xx JSON object without a top-level error, since no envelope is checked', async () => {
    const result = await answer(() => json(400, { something: 'else' }))
    expect(result).toMatchObject({ kind: 'error', status: 400, error: { something: 'else' } })
  })

  it('is redirect for a 302, with its Location', async () => {
    const result = await answer(() => new Response(null, { status: 302, headers: { location: 'https://cas.example/oidc/authorize' } }), {
      method: 'GET',
      url: '/api/auth/sign-in',
    })
    expect(result).toMatchObject({ kind: 'redirect', ok: false, status: 302, location: 'https://cas.example/oidc/authorize' })
  })

  it("is redirect with status 0 and no location for a browser's opaqueredirect", async () => {
    const result = await answer(() => {
      const response = new Response(null, { status: 200 })
      Object.defineProperty(response, 'type', { value: 'opaqueredirect' })
      return response
    })
    expect(result).toMatchObject({ kind: 'redirect', status: 0, location: null })
  })

  it('is unexpected for an undeclared 500, with the raw text', async () => {
    const text = JSON.stringify({ error: 'internal_error', description: 'An unexpected error occurred' })
    const result = await answer(() => new Response(text, { status: 500, headers: { 'content-type': 'application/json' } }))
    expect(result).toMatchObject({ kind: 'unexpected', ok: false, status: 500, body: text })
  })

  it("is unexpected for a declared 503 with a proxy's HTML page", async () => {
    const result = await answer(() => new Response('<html>Bad gateway</html>', { status: 503, headers: { 'content-type': 'text/html' } }))
    expect(result).toMatchObject({ kind: 'unexpected', status: 503, body: '<html>Bad gateway</html>' })
  })

  it.each([null, 'a string', ['an', 'array']])('is unexpected for a declared 4xx whose JSON is %j', async body => {
    const result = await answer(() => json(401, body))
    expect(result).toMatchObject({ kind: 'unexpected', status: 401, body: JSON.stringify(body) })
  })

  it('is unexpected for a declared 2xx whose body is not JSON', async () => {
    const result = await answer(() => new Response('<html>interstitial</html>', { status: 200 }))
    expect(result).toMatchObject({ kind: 'unexpected', status: 200, body: '<html>interstitial</html>' })
  })

  it('is unexpected for an undeclared 2xx', async () => {
    const result = await answer(() => json(201, []))
    expect(result).toMatchObject({ kind: 'unexpected', status: 201 })
  })

  it('is transport when fetch rejects, with that cause', async () => {
    const cause = new TypeError('fetch failed')
    const result = await answer(() => Promise.reject(cause))
    expect(result).toEqual({ kind: 'transport', ok: false, cause })
  })

  it('is transport when the signal aborts', async () => {
    const controller = new AbortController()
    const fetch: typeof globalThis.fetch = async (_input, init) =>
      await new Promise<Response>((_, reject) => init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true }))
    const pending = createClient({ baseUrl: 'https://h.example', fetch })({ ...users, signal: controller.signal })
    controller.abort()
    expect(await pending).toMatchObject({ kind: 'transport', cause: { name: 'AbortError' } })
  })

  it('is transport when the body stream errors', async () => {
    const cause = new Error('connection reset')
    const body = new ReadableStream({
      start: stream => stream.error(cause),
    })
    const result = await answer(() => new Response(body, { status: 200 }))
    expect(result).toEqual({ kind: 'transport', ok: false, cause })
  })
})

describe('the default client', () => {
  it('is a guard: there is no ambient base URL', () => {
    expect(() => client({ method: 'GET', url: '/health' })).toThrow('make a client with createClient({ baseUrl })')
  })

  it('is out of reach of a typed call: `client` is required, and an untyped call still meets the guard', () => {
    // @ts-expect-error `client` is required, even for an operation with nothing else to pass
    expect(() => getHealth({})).toThrow('make a client with createClient({ baseUrl })')
    // @ts-expect-error `client` is required next to the operation's own options
    expect(() => listUsers({ query: { ids: ['a'] } })).toThrow('make a client with createClient({ baseUrl })')
  })
})

describe('a generated operation', () => {
  it('passes its method, path template, query and signal to the client', async () => {
    const { request, sent } = scripted()
    await listUsers({ client: request, query: { ids: ['a', 'b'] }, headers: { authorization: 'Bearer t' } })
    expect(sent[0].url).toBe('https://h.example/api/users?ids=a&ids=b')
    expect(new Headers(sent[0].init.headers).get('authorization')).toBe('Bearer t')
  })
})
