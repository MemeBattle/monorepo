import { describe, expect, it, vi } from 'vitest'

import { ApiError } from '#shared/api/request'
import { requireNoSession, requireSession } from './gates'
import { routes } from './routes'

const { getMe } = vi.hoisted(() => ({ getMe: vi.fn() }))
vi.mock('#entities/session', () => ({ getMe }))

const me = { accountId: 'acc', displayName: 'Ада', accountType: 'full', email: null, sessionExpiresAt: '2026-09-17T00:00:00Z' }
const unauthenticated = () => new ApiError(401, 'unauthenticated', 'No live session')
const outage = () => new ApiError(503, 'unavailable', 'Database unavailable')

/** Loaders redirect by throwing the `Response` that `redirect()` builds. */
const redirectTo = (path: string) => (thrown: unknown) =>
  thrown instanceof Response && thrown.status === 302 && thrown.headers.get('Location') === path

describe('requireSession', () => {
  it('hands the account to the dashboard', async () => {
    getMe.mockResolvedValueOnce(me)

    await expect(requireSession()).resolves.toEqual(me)
  })

  it('sends a browser without a session to sign-in', async () => {
    getMe.mockRejectedValueOnce(unauthenticated())

    await expect(requireSession()).rejects.toSatisfy(redirectTo(routes.SIGN_IN))
  })

  it('lets any other failure reach the error screen', async () => {
    getMe.mockRejectedValueOnce(outage())

    await expect(requireSession()).rejects.toSatisfy(error => error instanceof ApiError && error.code === 'unavailable')
  })
})

describe('requireNoSession', () => {
  it('lets a browser without a session see the auth screens', async () => {
    getMe.mockRejectedValueOnce(unauthenticated())

    await expect(requireNoSession()).resolves.toBeNull()
  })

  it('sends a signed-in browser to the dashboard', async () => {
    getMe.mockResolvedValueOnce(me)

    await expect(requireNoSession()).rejects.toSatisfy(redirectTo(routes.DASHBOARD))
  })

  it('lets any other failure reach the error screen', async () => {
    getMe.mockRejectedValueOnce(outage())

    await expect(requireNoSession()).rejects.toSatisfy(error => error instanceof ApiError && error.code === 'unavailable')
  })
})
