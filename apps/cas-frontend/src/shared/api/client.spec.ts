import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest'

import { ApiError, client, isApiError } from './client'
import type { ErrorCodeOf, RequestResult } from './client'
import type { LogoutResponses } from './generated/models/Logout'
import type { PasskeyResponse } from './generated/models/PasskeyResponse'
import type { RenamePasskeyResponses } from './generated/models/RenamePasskey'

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

describe('client', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('parses a successful JSON response', async () => {
    stubFetch({ ok: true, status: 200, json: () => Promise.resolve({ id: 'acc_1', displayName: 'Гость' }) })

    await expect(client({ method: 'GET', url: '/api/me' })).resolves.toEqual({ id: 'acc_1', displayName: 'Гость' })
  })

  it('throws an ApiError built from the error body', async () => {
    stubFetch({ ok: false, status: 401, json: () => Promise.resolve({ error: { code: 'unauthenticated', message: 'Sign in first' } }) })

    const error = await client({ method: 'GET', url: '/api/me' }).catch((thrown: unknown) => thrown)

    expect(isApiError(error)).toBe(true)
    expect(error).toMatchObject({ status: 401, code: 'unauthenticated', message: 'Sign in first' })
  })

  it('falls back to the unknown code when the error body is not JSON', async () => {
    stubFetch({ ok: false, status: 502, statusText: 'Bad Gateway', json: () => Promise.reject(new SyntaxError('Unexpected token <')) })

    const error = await client({ method: 'GET', url: '/api/me' }).catch((thrown: unknown) => thrown)

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 502, code: 'unknown' })
  })

  it('falls back to the unknown code when the error body has no error object', async () => {
    stubFetch({ ok: false, status: 500, statusText: 'Internal Server Error', json: () => Promise.resolve({ oops: true }) })

    const error = await client({ method: 'GET', url: '/api/me' }).catch((thrown: unknown) => thrown)

    expect(error).toMatchObject({ status: 500, code: 'unknown' })
  })

  it('sends a JSON body and its content type only when a body is given', async () => {
    const withBody = stubFetch({ ok: true, status: 204, json: () => Promise.resolve(undefined) })

    await client({ method: 'PATCH', url: '/api/passkeys/{id}', path: { id: 'pk_1' }, body: { name: 'MacBook' } })

    expect(withBody).toHaveBeenCalledWith('/api/passkeys/pk_1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: '{"name":"MacBook"}',
    })

    vi.unstubAllGlobals()
    const withoutBody = stubFetch({ ok: true, status: 204, json: () => Promise.resolve(undefined) })

    await client({ method: 'POST', url: '/api/logout' })

    expect(withoutBody).toHaveBeenCalledWith('/api/logout', { method: 'POST', headers: undefined, body: undefined })
  })

  it('answers undefined for a 204 without reading the body', async () => {
    const json = vi.fn(() => Promise.reject(new SyntaxError('Unexpected end of JSON input')))
    stubFetch({ ok: true, status: 204, json })

    await expect(client({ method: 'DELETE', url: '/api/passkeys/{id}', path: { id: 'pk_1' } })).resolves.toBeUndefined()
    expect(json).not.toHaveBeenCalled()
  })

  it('percent-encodes the path parameters it substitutes', async () => {
    const fetchMock = stubFetch({ ok: true, status: 204, json: () => Promise.resolve(undefined) })

    await client({ method: 'DELETE', url: '/api/passkeys/{id}', path: { id: 'a/b c' } })

    expect(fetchMock).toHaveBeenCalledWith('/api/passkeys/a%2Fb%20c', expect.objectContaining({ method: 'DELETE' }))
  })
})

describe('the types of a generated operation', () => {
  it('collects the error codes the operation declares', () => {
    expectTypeOf<ErrorCodeOf<RenamePasskeyResponses>>().toEqualTypeOf<
      | 'invalid_body'
      | 'invalid_passkey_name'
      | 'invalid_path'
      | 'unauthenticated'
      | 'cross_site_request'
      | 'passkey_not_found'
      | 'last_passkey'
      | 'internal_error'
      | 'database_busy'
      | 'database_unavailable'
    >()
  })

  it('resolves to the success body, and to undefined for a 204', () => {
    expectTypeOf<RequestResult<RenamePasskeyResponses>>().toEqualTypeOf<PasskeyResponse>()
    expectTypeOf<RequestResult<LogoutResponses>>().toEqualTypeOf<undefined>()
  })

  it('refuses a code the operation does not declare', () => {
    const error: unknown = new ApiError(400, 'invalid_body', '')
    if (isApiError<ErrorCodeOf<LogoutResponses>>(error)) {
      // @ts-expect-error logout never answers `invalid_passkey_name`
      expect(error.code === 'invalid_passkey_name').toBe(false)
      expectTypeOf(error.code).toEqualTypeOf<'cross_site_request' | 'internal_error' | 'database_busy' | 'database_unavailable' | 'unknown'>()
    }
  })
})
