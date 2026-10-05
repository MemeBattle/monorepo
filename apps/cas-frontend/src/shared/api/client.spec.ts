import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest'

import { ApiError, client, failed, ok, unwrap } from './client'
import type { ErrorCodeOf, RequestResult, Result } from './client'
import type { LogoutResponses } from './generated/models/Logout'
import type { PasskeyResponse } from './generated/models/PasskeyResponse'
import type { RenamePasskeyResponses } from './generated/models/RenamePasskey'
import type { renamePasskey } from './generated/operations/renamePasskey'

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

const errorBody = (code: string, message: unknown) => () => Promise.resolve({ error: { code, message } })

describe('client', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('parses a successful JSON response', async () => {
    stubFetch({ ok: true, status: 200, json: () => Promise.resolve({ id: 'acc_1', displayName: 'Гость' }) })

    await expect(client({ method: 'GET', url: '/api/me' })).resolves.toEqual({ ok: true, data: { id: 'acc_1', displayName: 'Гость' } })
  })

  it('answers a 4xx with a CAS error body as a value, without throwing', async () => {
    stubFetch({ ok: false, status: 401, json: errorBody('unauthenticated', 'Sign in first') })

    await expect(client({ method: 'GET', url: '/api/me' })).resolves.toEqual({
      ok: false,
      error: { status: 401, code: 'unauthenticated', message: 'Sign in first' },
    })
  })

  it('throws an ApiError for a 5xx, with the code of its body', async () => {
    stubFetch({ ok: false, status: 503, statusText: 'Service Unavailable', json: errorBody('database_unavailable', 'Database unavailable') })

    const error = await client({ method: 'GET', url: '/api/me' }).catch((thrown: unknown) => thrown)

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 503, code: 'database_unavailable', message: 'Database unavailable' })
  })

  it.each([400, 502])('throws with the unknown code when the error body of a %i is not JSON', async status => {
    stubFetch({ ok: false, status, statusText: 'Bad', json: () => Promise.reject(new SyntaxError('Unexpected token <')) })

    const error = await client({ method: 'GET', url: '/api/me' }).catch((thrown: unknown) => thrown)

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status, code: 'unknown' })
  })

  it.each([404, 500])('throws with the unknown code when the error body of a %i has no error object', async status => {
    stubFetch({ ok: false, status, statusText: 'Oops', json: () => Promise.resolve({ oops: true }) })

    const error = await client({ method: 'GET', url: '/api/me' }).catch((thrown: unknown) => thrown)

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status, code: 'unknown' })
  })

  it.each([
    ['missing', undefined],
    ['not a string', 42],
  ])('falls back to the status text when the message is %s', async (_, message) => {
    stubFetch({ ok: false, status: 400, statusText: 'Bad Request', json: errorBody('invalid_body', message) })

    await expect(client({ method: 'POST', url: '/api/logout' })).resolves.toEqual(failed(400, 'invalid_body', 'Bad Request'))
  })

  it('lets a fetch that rejects reject', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    await expect(client({ method: 'GET', url: '/api/me' })).rejects.toBeInstanceOf(TypeError)
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

  it('answers undefined data for a 204 without reading the body', async () => {
    const json = vi.fn(() => Promise.reject(new SyntaxError('Unexpected end of JSON input')))
    stubFetch({ ok: true, status: 204, json })

    await expect(client({ method: 'DELETE', url: '/api/passkeys/{id}', path: { id: 'pk_1' } })).resolves.toEqual({ ok: true, data: undefined })
    expect(json).not.toHaveBeenCalled()
  })

  it('percent-encodes the path parameters it substitutes', async () => {
    const fetchMock = stubFetch({ ok: true, status: 204, json: () => Promise.resolve(undefined) })

    await client({ method: 'DELETE', url: '/api/passkeys/{id}', path: { id: 'a/b c' } })

    expect(fetchMock).toHaveBeenCalledWith('/api/passkeys/a%2Fb%20c', expect.objectContaining({ method: 'DELETE' }))
  })
})

describe('unwrap', () => {
  it('returns the data of a success', () => {
    expect(unwrap(ok([1, 2]))).toEqual([1, 2])
  })

  it('throws a failure as an ApiError', () => {
    expect(() => unwrap(failed(401, 'unauthenticated', 'No live session'))).toThrow(ApiError)
    expect(() => unwrap(failed(401, 'unauthenticated', 'No live session'))).toThrow(
      expect.objectContaining({ status: 401, code: 'unauthenticated', message: 'No live session' }),
    )
  })
})

describe('the types of a generated operation', () => {
  it('collects the codes of the 4xx responses the operation declares, and no 5xx code', () => {
    expectTypeOf<ErrorCodeOf<RenamePasskeyResponses>>().toEqualTypeOf<
      'invalid_body' | 'invalid_passkey_name' | 'invalid_path' | 'unauthenticated' | 'cross_site_request' | 'passkey_not_found' | 'last_passkey'
    >()
    expectTypeOf<'internal_error'>().not.toExtend<ErrorCodeOf<RenamePasskeyResponses>>()
  })

  it('resolves to the success body or a declared failure, with undefined data for a 204', () => {
    expectTypeOf<RequestResult<RenamePasskeyResponses>>().toEqualTypeOf<Result<PasskeyResponse, ErrorCodeOf<RenamePasskeyResponses>>>()
    expectTypeOf<RequestResult<LogoutResponses>>().toEqualTypeOf<Result<undefined, 'cross_site_request'>>()
  })

  it('refuses a code the operation does not declare', () => {
    const result = failed(409, 'last_passkey', '') as Awaited<ReturnType<typeof renamePasskey>>
    if (!result.ok) {
      // @ts-expect-error renaming never answers `invalid_email`
      expect(result.error.code === 'invalid_email').toBe(false)
    }
  })
})
