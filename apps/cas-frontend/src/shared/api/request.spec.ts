import { afterEach, describe, expect, it, vi } from 'vitest'

import { ApiError, isApiError, request } from './request'

interface ResponseStub {
  ok: boolean
  status: number
  statusText?: string
  json: () => Promise<unknown>
}

const stubFetch = (response: ResponseStub) => {
  const fetchMock = vi.fn().mockResolvedValue(response)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('request', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('parses a successful JSON response', async () => {
    stubFetch({ ok: true, status: 200, json: () => Promise.resolve({ id: 'acc_1', displayName: 'Гость' }) })

    await expect(request<{ id: string; displayName: string }>('/api/me')).resolves.toEqual({ id: 'acc_1', displayName: 'Гость' })
  })

  it('throws an ApiError built from the error body', async () => {
    stubFetch({ ok: false, status: 401, json: () => Promise.resolve({ error: { code: 'unauthenticated', message: 'Sign in first' } }) })

    const error = await request('/api/me').catch((thrown: unknown) => thrown)

    expect(isApiError(error)).toBe(true)
    expect(error).toMatchObject({ status: 401, code: 'unauthenticated', message: 'Sign in first' })
  })

  it('falls back to the unknown code when the error body is not JSON', async () => {
    stubFetch({ ok: false, status: 502, statusText: 'Bad Gateway', json: () => Promise.reject(new SyntaxError('Unexpected token <')) })

    const error = await request('/api/me').catch((thrown: unknown) => thrown)

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 502, code: 'unknown' })
  })

  it('falls back to the unknown code when the error body has no error object', async () => {
    stubFetch({ ok: false, status: 500, statusText: 'Internal Server Error', json: () => Promise.resolve({ oops: true }) })

    const error = await request('/api/me').catch((thrown: unknown) => thrown)

    expect(error).toMatchObject({ status: 500, code: 'unknown' })
  })

  it('sends a JSON body and its content type only when a body is given', async () => {
    const withBody = stubFetch({ ok: true, status: 204, json: () => Promise.resolve(undefined) })

    await request('/api/passkeys/pk_1', { method: 'PATCH', body: { name: 'MacBook' } })

    expect(withBody).toHaveBeenCalledWith('/api/passkeys/pk_1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: '{"name":"MacBook"}',
    })

    vi.unstubAllGlobals()
    const withoutBody = stubFetch({ ok: true, status: 204, json: () => Promise.resolve(undefined) })

    await request('/api/logout', { method: 'POST' })

    expect(withoutBody).toHaveBeenCalledWith('/api/logout', { method: 'POST', headers: undefined, body: undefined })
  })
})
