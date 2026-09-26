import { describe, expect, it } from 'vitest'

import { ApiError } from '#shared/api/request'
import { requireNoSession, requireSession } from './gates'
import { routes } from './routes'

import { aMe, mockGetMe } from '#entities/session/testing'

const me = aMe()

/** Loaders redirect by throwing the `Response` that `redirect()` builds. */
const redirectTo = (path: string) => (thrown: unknown) =>
  thrown instanceof Response && thrown.status === 302 && thrown.headers.get('Location') === path

describe('requireSession', () => {
  it('hands the account to the dashboard', async () => {
    mockGetMe(me)

    await expect(requireSession()).resolves.toEqual(me)
  })

  it('sends a browser without a session to sign-in', async () => {
    mockGetMe.error('unauthenticated')

    await expect(requireSession()).rejects.toSatisfy(redirectTo(routes.SIGN_IN))
  })

  it('lets any other failure reach the error screen', async () => {
    mockGetMe.error('database_unavailable')

    await expect(requireSession()).rejects.toSatisfy(error => error instanceof ApiError && error.code === 'database_unavailable')
  })
})

describe('requireNoSession', () => {
  it('lets a browser without a session see the auth screens', async () => {
    mockGetMe.error('unauthenticated')

    await expect(requireNoSession()).resolves.toBeNull()
  })

  it('sends a signed-in browser to the dashboard', async () => {
    mockGetMe(me)

    await expect(requireNoSession()).rejects.toSatisfy(redirectTo(routes.DASHBOARD))
  })

  it('lets any other failure reach the error screen', async () => {
    mockGetMe.error('database_unavailable')

    await expect(requireNoSession()).rejects.toSatisfy(error => error instanceof ApiError && error.code === 'database_unavailable')
  })
})
