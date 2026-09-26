import { describe, expect, it } from 'vitest'
import { request, ApiError } from '#shared/api/request'
import { mockRequest } from './mockRequest'
import { assertNoUnhandledRequests, resetRuntime } from './runtime'

describe('network boundary', () => {
  it('matches relative paths and records flattened decoded params and JSON body', async () => {
    const rename = mockRequest('PATCH', '/api/passkeys/:id').json({ name: 'Phone' })
    await expect(request('/api/passkeys/pk_2', { method: 'PATCH', body: { name: 'Phone' } })).resolves.toEqual({ name: 'Phone' })
    expect(rename).toHaveBeenCalledExactlyOnceWith({ id: 'pk_2', name: 'Phone' })
  })

  it('replaces an earlier answer and resets registrations and spies', async () => {
    const old = mockRequest('GET', '/api/me').json({ name: 'old' })
    const latest = mockRequest('GET', '/api/me').json({ name: 'new' })
    await expect(request('/api/me')).resolves.toEqual({ name: 'new' })
    expect(old).not.toHaveBeenCalled()
    expect(latest).toHaveBeenCalledOnce()
    resetRuntime()
    expect(latest).not.toHaveBeenCalled()
    await request('/api/me').catch(() => {})
    expect(() => assertNoUnhandledRequests()).toThrow('GET http://localhost:3000/api/me')
  })

  it('answers a genuinely empty 204', async () => {
    mockRequest('POST', '/api/logout').empty()
    const response = await fetch('/api/logout', { method: 'POST' })
    expect(response.status).toBe(204)
    expect(await response.text()).toBe('')
  })

  it('passes CAS errors and transport errors through real request()', async () => {
    mockRequest('GET', '/api/me').error(401, 'unauthenticated')
    await expect(request('/api/me')).rejects.toEqual(new ApiError(401, 'unauthenticated', 'unauthenticated'))
    mockRequest('GET', '/api/me').networkError()
    await expect(request('/api/me')).rejects.toThrow('Failed to fetch')
  })

  it('detects an unanswered request even when application code catches it', async () => {
    await request('/api/unanswered').catch(() => {})
    expect(() => assertNoUnhandledRequests()).toThrow('Unhandled CAS request: GET')
  })
})

it('matches the entire pathname, not an API-looking suffix', async () => {
  const answered = mockRequest('GET', '/api/me').json({ name: 'Ada' })
  await request('/unrelated/api/me').catch(() => {})
  expect(answered).not.toHaveBeenCalled()
  expect(() => assertNoUnhandledRequests()).toThrow('/unrelated/api/me')
})
