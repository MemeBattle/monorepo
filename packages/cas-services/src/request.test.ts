import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createBaseRequest } from './request'

function makeFetchResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return {
    status,
    json: () => Promise.resolve(body),
    headers: {
      entries: () => Object.entries(headers)[Symbol.iterator](),
    },
  } as unknown as Response
}

describe('createBaseRequest', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('returns parsed JSON body directly on success', async () => {
    const responseBody = { success: true, data: { token: 'abc' } }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeFetchResponse(responseBody, 200)))

    const client = createBaseRequest({ casURI: 'https://cas.example.com' })
    const result = await client.post('/auth/login', { login: 'user', password: 'pass' })

    expect(result).toEqual(responseBody)
  })

  it('calls successLogger with status, data, headers, and url', async () => {
    const responseBody = { success: true }
    const responseHeaders = { 'content-type': 'application/json' }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeFetchResponse(responseBody, 200, responseHeaders)))

    const successLogger = vi.fn()
    const client = createBaseRequest({ casURI: 'https://cas.example.com', successLogger })

    await client.get('/health')

    expect(successLogger).toHaveBeenCalledOnce()
    expect(successLogger).toHaveBeenCalledWith(200, responseBody, responseHeaders, 'https://cas.example.com/health')
  })

  it('returns { success: false, errorCode: 500 } and calls errorLogger on network failure', async () => {
    const networkError = new Error('Network failure')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(networkError))

    const errorLogger = vi.fn()
    const client = createBaseRequest({ casURI: 'https://cas.example.com', errorLogger })

    const result = await client.get('/health')

    expect(result).toMatchObject({ success: false, errorCode: 500 })
    expect(errorLogger).toHaveBeenCalledOnce()
    expect(errorLogger).toHaveBeenCalledWith(networkError)
  })

  it('serializes array params with repeat format', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeFetchResponse({})))

    const client = createBaseRequest({ casURI: 'https://cas.example.com' })
    await client.get('/users', { params: { ids: ['a', 'b', 'c'] } })

    const calledUrl = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(calledUrl).toBe('https://cas.example.com/users?ids=a&ids=b&ids=c')
  })

  it('sets Content-Type: application/json for JSON body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeFetchResponse({})))

    const client = createBaseRequest({ casURI: 'https://cas.example.com' })
    await client.post('/auth/login', { login: 'user', password: 'pass' })

    const calledInit = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1] as RequestInit
    expect((calledInit.headers as Record<string, string>)['Content-Type']).toBe('application/json')
  })

  it('does not set Content-Type for FormData body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeFetchResponse({})))

    const client = createBaseRequest({ casURI: 'https://cas.example.com' })
    await client.patch('/users/123', new FormData(), { headers: { Authorization: 'token' } })

    const calledInit = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1] as RequestInit
    expect((calledInit.headers as Record<string, string>)['Content-Type']).toBeUndefined()
  })

  it('returns HTTP error body directly (no throw on 4xx)', async () => {
    const errorBody = { success: false, error: { errorCode: 404, errorMessage: 'user not found' } }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeFetchResponse(errorBody, 404)))

    const client = createBaseRequest({ casURI: 'https://cas.example.com' })
    const result = await client.get('/auth/me')

    expect(result).toEqual(errorBody)
  })
})
