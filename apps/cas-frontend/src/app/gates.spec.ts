import { afterEach, describe, expect, it, vi } from 'vitest'

import { aMe, mockGetMe } from '#entities/session/testing'
import { ApiError } from '#shared/api/client'
import { requireNoSession, requireSession } from './gates'
import { routes } from './routes'

const { leaveTo } = vi.hoisted(() => ({ leaveTo: vi.fn() }))
// Only the document navigation is faked; `readReturnTo` stays real, so the spec covers what is accepted too.
vi.mock('./returnTo', async importOriginal => ({ ...(await importOriginal<typeof import('./returnTo')>()), leaveTo }))

const me = aMe()
const guest = aMe({ accountId: 'g', displayName: 'Guest 7', accountType: 'guest' })

/** The loader arguments of a navigation to sign-in with this query string. */
const signInWith = (search = '', signal?: AbortSignal) => ({
  request: new Request(new URL(`${routes.SIGN_IN}${search}`, window.location.origin), { signal }),
})

/** A query string with `return_to` set to the value, encoded the way a browser would. */
const returnTo = (value: string) => `?${new URLSearchParams({ return_to: value }).toString()}`

/** Loaders redirect by throwing the `Response` that `redirect()` builds. */
const redirectTo = (path: string) => (thrown: unknown) =>
  thrown instanceof Response && thrown.status === 302 && thrown.headers.get('Location') === path

describe('requireSession', () => {
  it('hands the account to the dashboard', async () => {
    mockGetMe(me)

    await expect(requireSession()).resolves.toEqual(me)
  })

  it('hands a guest to the dashboard, which decides what to show it', async () => {
    mockGetMe(guest)

    await expect(requireSession()).resolves.toEqual(guest)
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
  afterEach(() => {
    leaveTo.mockReset()
  })

  it('lets a browser without a session see the auth screens', async () => {
    mockGetMe.error('unauthenticated')

    await expect(requireNoSession(signInWith())).resolves.toBeNull()
  })

  it('sends a signed-in browser to the dashboard', async () => {
    mockGetMe(me)

    await expect(requireNoSession(signInWith())).rejects.toSatisfy(redirectTo(routes.DASHBOARD))
  })

  it('lets any other failure reach the error screen', async () => {
    mockGetMe.error('database_unavailable')

    await expect(requireNoSession(signInWith())).rejects.toSatisfy(error => error instanceof ApiError && error.code === 'database_unavailable')
  })

  it('forwards a signed-in browser to an accepted return_to', async () => {
    mockGetMe(me)
    // The real one never settles; settling here shows that nothing is thrown after it.
    leaveTo.mockResolvedValueOnce(undefined)

    await expect(requireNoSession(signInWith(returnTo('/oidc/authorize?client_id=x')))).resolves.toBeUndefined()
    expect(leaveTo).toHaveBeenCalledWith('/oidc/authorize?client_id=x')
  })

  it.each([
    ['another origin', 'https://evil.example/'],
    ['a path that normalizes to another origin', '/.//evil.example/'],
  ])('sends a signed-in browser with a return_to of %s to the dashboard', async (_, value) => {
    mockGetMe(me)

    await expect(requireNoSession(signInWith(returnTo(value)))).rejects.toSatisfy(redirectTo(routes.DASHBOARD))
    expect(leaveTo).not.toHaveBeenCalled()
  })

  it('lets a browser without a session see the auth screens whatever return_to says', async () => {
    mockGetMe.error('unauthenticated')

    await expect(requireNoSession(signInWith(returnTo('/oidc/authorize?client_id=x')))).resolves.toBeNull()
    expect(leaveTo).not.toHaveBeenCalled()
  })

  it('keeps a guest on the auth screens and hands it over', async () => {
    mockGetMe(guest)

    await expect(requireNoSession(signInWith())).resolves.toEqual(guest)
  })

  it('never forwards a guest, whatever return_to says', async () => {
    mockGetMe(guest)

    await expect(requireNoSession(signInWith(returnTo('/oidc/authorize?client_id=x')))).resolves.toEqual(guest)
    expect(leaveTo).not.toHaveBeenCalled()
  })

  it('does not leave for a navigation abandoned while the session was looked up', async () => {
    let answer: (value: typeof me) => void = () => {}
    const lookedUp = mockGetMe.respond(
      () =>
        new Promise(resolve => {
          answer = resolve
        }),
    )
    const navigation = new AbortController()

    const loading = requireNoSession(signInWith(returnTo('/oidc/authorize?client_id=x'), navigation.signal))
    await vi.waitFor(() => expect(lookedUp).toHaveBeenCalledOnce())
    navigation.abort()
    answer(me)

    await expect(loading).rejects.toMatchObject({ name: 'AbortError' })
    expect(leaveTo).not.toHaveBeenCalled()
  })
})
