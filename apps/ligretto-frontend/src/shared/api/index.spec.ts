import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { LIGRETTO_CORE_URL } from '#shared/constants/config'

import { getMe, getUsersByIds } from './index'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const me = {
  user: { sub: 'sub-1', accountType: 'guest', name: null, avatarUrl: null },
  accessToken: 'token-1',
  expiresAt: 1_000,
  signedOut: false,
} as const

let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>

/** The URL and the init of the one request sent. */
const sent = () => {
  expect(fetchMock).toHaveBeenCalledOnce()
  const [url, init] = fetchMock.mock.calls[0]
  return { url: String(url), init: init ?? {}, headers: new Headers(init?.headers) }
}

beforeEach(() => {
  fetchMock = vi.fn<typeof fetch>()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('getUsersByIds', () => {
  it('sends the ids as repeated keys with the bearer token and resolves the users', async () => {
    const users = [
      { sub: 'a', accountType: 'full', name: 'Ann', avatarUrl: null },
      { sub: 'b', accountType: 'guest', name: null, avatarUrl: null },
    ]
    fetchMock.mockResolvedValue(json(users))

    const result = await getUsersByIds(['a', 'b'], 'token-1')

    const { url, init, headers } = sent()
    expect(url).toBe(`${LIGRETTO_CORE_URL}/api/users?ids=a&ids=b`)
    expect(init).toMatchObject({ method: 'GET', credentials: 'include', redirect: 'manual' })
    expect(headers.get('authorization')).toBe('Bearer token-1')
    expect(result).toMatchObject({ kind: 'success', status: 200, data: users })
  })

  it('resolves a 401 as an error with its code', async () => {
    fetchMock.mockResolvedValue(json({ error: 'unauthorized' }, 401))

    expect(await getUsersByIds(['a'], 'expired')).toMatchObject({ kind: 'error', status: 401, error: { error: 'unauthorized' } })
  })
})

describe('getMe', () => {
  it('sends the session cookie and no bearer token, and resolves the identity', async () => {
    fetchMock.mockResolvedValue(json(me))

    const result = await getMe()

    const { url, init, headers } = sent()
    expect(url).toBe(`${LIGRETTO_CORE_URL}/api/auth/me`)
    expect(init).toMatchObject({ method: 'GET', credentials: 'include' })
    expect(headers.has('authorization')).toBe(false)
    expect(result).toMatchObject({ kind: 'success', status: 200, data: me })
  })

  it('resolves a 503 as an error with its code', async () => {
    fetchMock.mockResolvedValue(json({ error: 'cas_unavailable' }, 503))

    expect(await getMe()).toMatchObject({ kind: 'error', status: 503, error: { error: 'cas_unavailable' } })
  })

  it('resolves a proxy page as unexpected', async () => {
    fetchMock.mockResolvedValue(new Response('<html>Bad Gateway</html>', { status: 502 }))

    expect(await getMe()).toMatchObject({ kind: 'unexpected', status: 502 })
  })

  it('resolves a rejected fetch as a transport failure', async () => {
    const cause = new TypeError('Failed to fetch')
    fetchMock.mockRejectedValue(cause)

    expect(await getMe()).toEqual({ kind: 'transport', ok: false, cause })
  })
})
