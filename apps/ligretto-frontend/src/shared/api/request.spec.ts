import { afterEach, describe, expect, it, vi } from 'vitest'

import { buildSearchParams, request, RequestError } from './request'

describe('buildSearchParams', () => {
  it('repeats array params instead of comma-joining them', () => {
    const params = buildSearchParams({ ids: ['6a932978f77c9c7a7951e541', '6a93297bf77c9cb1a451e542'] })

    expect(params.toString()).toBe('ids=6a932978f77c9c7a7951e541&ids=6a93297bf77c9cb1a451e542')
  })

  it('serializes flat values and skips nullish ones', () => {
    const params = buildSearchParams({ page: 2, search: 'abc', empty: undefined, missing: null })

    expect(params.toString()).toBe('page=2&search=abc')
  })
})

describe('request', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('fetches users with repeated ids params', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve([]) })
    vi.stubGlobal('fetch', fetchMock)

    await request.get('/users', { params: { ids: ['6a932978f77c9c7a7951e541', '6a93297bf77c9cb1a451e542'] } })

    const [url] = fetchMock.mock.calls[0]
    expect(url).toContain('/users?ids=6a932978f77c9c7a7951e541&ids=6a93297bf77c9cb1a451e542')
  })

  it('sends the credentials and returns the data of a 2xx answer', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({ id: 1 }) })
    vi.stubGlobal('fetch', fetchMock)

    await expect(request.get('/auth/me')).resolves.toEqual({ data: { id: 1 } })

    const [, init] = fetchMock.mock.calls[0]
    expect(init).toMatchObject({ method: 'GET', credentials: 'include' })
  })

  it('throws a RequestError with the status and the body of a non-2xx answer', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503, json: () => Promise.resolve({ error: 'cas_unavailable' }) }))

    const error = await request.get('/auth/me').catch((e: unknown) => e)

    expect(error).toBeInstanceOf(RequestError)
    expect(error).toMatchObject({ status: 503, body: { error: 'cas_unavailable' } })
  })

  it('throws a RequestError without a body when the answer is not JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 502, json: () => Promise.reject(new SyntaxError('Unexpected token')) }))

    await expect(request.get('/auth/me')).rejects.toMatchObject({ status: 502, body: undefined })
  })
})
