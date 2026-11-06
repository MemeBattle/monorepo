import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { mockSignInWithPasskey } from '#entities/session/testing'
import { routes } from '#app/routes'
import { SignInPage } from './SignInPage'

const { startAuthentication, browserSupportsWebAuthnAutofill, cancelCeremony, leaveTo } = vi.hoisted(() => ({
  startAuthentication: vi.fn(),
  browserSupportsWebAuthnAutofill: vi.fn(),
  cancelCeremony: vi.fn(),
  leaveTo: vi.fn(),
}))
vi.mock('@simplewebauthn/browser', async importOriginal => ({
  ...(await importOriginal<typeof import('@simplewebauthn/browser')>()),
  startAuthentication,
  browserSupportsWebAuthnAutofill,
  WebAuthnAbortService: { cancelCeremony, createNewAbortSignal: vi.fn() },
}))
let signInWithPasskey: ReturnType<typeof mockSignInWithPasskey>
/** The real ceremony withdraws an unanswered browser offer by cancelling WebAuthn. */
const standingOffer = () =>
  new Promise<never>((_, reject) => {
    cancelCeremony.mockImplementationOnce(() => reject(new DOMException('Cancelled', 'AbortError')))
  })

// Only the document navigation is faked; `readReturnTo` and `ReturnToLink` stay real.
vi.mock('#app/returnTo', async importOriginal => ({ ...(await importOriginal<typeof import('#app/returnTo')>()), leaveTo }))

/** The authorization request CAS sends the browser back to, and the sign-in screen it opens. */
const authorize = '/oidc/authorize?client_id=x&state=s'
const withReturnTo = (value: string) => `${routes.SIGN_IN}?${new URLSearchParams({ return_to: value }).toString()}`

/**
 * What a test leaves pending is settled once it is over: React entangles a
 * pending action with every later transition, so an action that never ends
 * would hold back the next test's navigations.
 */
const unsettled: (() => void)[] = []
/** The real `leaveTo` never settles, the browser leaves; the fake stays pending until the test is over. */
const pendingLeave = () => new Promise<never>(resolve => unsettled.push(() => resolve(undefined as never)))
/** A button ceremony nobody answers until the test is over, then a cancelled one. */
const pendingCeremony = () => new Promise<never>((_, reject) => unsettled.push(() => reject(new DOMException('ended', 'NotAllowedError'))))

/** Observe real response parsing so a late offer finishes before asserting it did not navigate. */
const finishLateOffer = async (pick: (value: unknown) => void) => {
  const parsed = vi.spyOn(Response.prototype, 'json')
  try {
    pick({ id: 'cred' })
    await waitFor(() => expect(parsed).toHaveResolvedWith({ accountId: 'acc', credentialId: 'cred' }))
  } finally {
    parsed.mockRestore()
  }
}

const renderPage = (entry: string = routes.SIGN_IN) => {
  const router = createMemoryRouter(
    [
      { path: routes.SIGN_IN, element: <SignInPage /> },
      { path: routes.DASHBOARD, element: <h1>Дашборд</h1> },
      { path: routes.CREATE_ACCOUNT, element: <h1>Создать аккаунт</h1> },
    ],
    { initialEntries: [entry] },
  )
  render(<RouterProvider router={router} />)
}

const signIn = async (entry?: string) => {
  renderPage(entry)
  await screen.findByRole('button', { name: 'Войти с пасскеем' })
  await userEvent.setup().click(screen.getByRole('button', { name: 'Войти с пасскеем' }))
}

describe('SignInPage', () => {
  beforeEach(() => {
    signInWithPasskey = mockSignInWithPasskey()
    browserSupportsWebAuthnAutofill.mockReset().mockResolvedValue(false)
    startAuthentication.mockReset().mockResolvedValue({ id: 'cred' })
    cancelCeremony.mockReset()
    leaveTo.mockImplementation(pendingLeave)
  })

  afterEach(() => {
    // No `globals` in the vitest config, so testing-library does not unmount on its own.
    cleanup()
    for (const settle of unsettled.splice(0)) {
      settle()
    }
    leaveTo.mockReset()
  })

  it('runs the ceremony and lands on the dashboard', async () => {
    signInWithPasskey = mockSignInWithPasskey({ accountId: 'acc', credentialId: 'cred' })

    await signIn()

    await waitFor(() => expect(signInWithPasskey).toHaveBeenCalledOnce())
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Дашборд' })).toBeDefined())
  })

  it('points an unknown passkey to create account and offers another passkey', async () => {
    signInWithPasskey = mockSignInWithPasskey.error('invalid_credential')

    await signIn()

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Этот пасскей здесь не зарегистрирован')
    expect(alert.textContent).not.toContain('invalid_credential')
    expect(screen.getByRole('link', { name: 'Создать аккаунт' }).getAttribute('href')).toBe(routes.CREATE_ACCOUNT)
    expect(screen.getByRole('button', { name: 'Выбрать другой пасскей' })).toBeDefined()
  })

  it('shows a cancelled ceremony as an alert above a still usable form', async () => {
    startAuthentication.mockRejectedValue(new DOMException('The operation either timed out or was not allowed.', 'NotAllowedError'))

    await signIn()

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Вход отменён')
    expect(alert.textContent).not.toContain('not allowed')
    expect(screen.getByRole('button', { name: 'Попробовать ещё раз' })).toBeDefined()
  })

  it('shows a challenge the server no longer has as a cancelled ceremony', async () => {
    signInWithPasskey = mockSignInWithPasskey.error('login_not_found')

    await signIn()

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Вход отменён')
    expect(alert.textContent).not.toContain('login_not_found')
  })

  it('tells a page served from the wrong origin which address to open', async () => {
    startAuthentication.mockRejectedValue(new DOMException('The operation is insecure.', 'SecurityError'))

    await signIn()

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Этот адрес не подходит для входа')
    expect(alert.textContent).not.toContain('insecure')
  })

  it.each([
    ['a network failure', { networkError: true as const }, 'Failed to fetch'],
    ['an outage', { error: 'database_unavailable' as const }, 'database_unavailable'],
    ['a refused cross-site request', { error: 'cross_site_request' as const }, 'cross_site_request'],
  ])('shows %s as the generic alert, never the raw message', async (_, error, raw) => {
    signInWithPasskey = mockSignInWithPasskey.respond(() => error)

    await signIn()

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Что-то пошло не так')
    expect(alert.textContent).not.toContain(raw)
  })

  it('offers the passkey through autofill as soon as the screen is up and signs in with the pick', async () => {
    browserSupportsWebAuthnAutofill.mockResolvedValue(true)

    renderPage()

    await waitFor(() => expect(startAuthentication).toHaveBeenCalledWith(expect.objectContaining({ useBrowserAutofill: true })))
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Дашборд' })).toBeDefined())
    await waitFor(() => expect(signInWithPasskey).toHaveBeenCalledOnce())
  })

  it('shows what went wrong with a picked passkey the same way as for the button', async () => {
    browserSupportsWebAuthnAutofill.mockResolvedValue(true)
    mockSignInWithPasskey.error('invalid_credential')

    renderPage()

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Этот пасскей здесь не зарегистрирован')
    expect(screen.getByRole('button', { name: 'Выбрать другой пасскей' })).toBeDefined()
  })

  it('withdraws the autofill offer before the button starts its own ceremony', async () => {
    browserSupportsWebAuthnAutofill.mockResolvedValue(true)
    startAuthentication.mockImplementation(({ useBrowserAutofill }) => {
      if (useBrowserAutofill) {
        return standingOffer()
      }
      expect(cancelCeremony).toHaveBeenCalledOnce()
      return pendingCeremony()
    })
    renderPage()
    await waitFor(() => expect(startAuthentication).toHaveBeenCalledOnce())
    await userEvent.setup().click(screen.getByRole('button', { name: 'Войти с пасскеем' }))
    await waitFor(() => expect(startAuthentication).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(signInWithPasskey).toHaveBeenCalledTimes(2))
    expect(screen.getByRole('button', { name: 'Подтвердите пасскей…' })).toBeDefined()
  })

  it('withdraws the autofill offer when the screen is left', async () => {
    browserSupportsWebAuthnAutofill.mockResolvedValue(true)
    startAuthentication.mockImplementation(standingOffer)
    renderPage()
    await waitFor(() => expect(startAuthentication).toHaveBeenCalledOnce())
    cleanup()
    expect(cancelCeremony).toHaveBeenCalledOnce()
    await waitFor(() => expect(signInWithPasskey).toHaveBeenCalledOnce())
  })

  describe('opened with return_to', () => {
    it('leaves for it after the button signs in, not for the dashboard', async () => {
      signInWithPasskey = mockSignInWithPasskey({ accountId: 'acc', credentialId: 'cred' })

      await signIn(withReturnTo(authorize))

      await waitFor(() => expect(leaveTo).toHaveBeenCalledWith(authorize))
      expect(screen.queryByRole('heading', { name: 'Дашборд' })).toBeNull()
      // The button keeps its pending state until the browser has left.
      expect(screen.getByRole('button', { name: 'Подтвердите пасскей…' })).toBeDefined()
    })

    it('leaves for it after the autofill offer signs in', async () => {
      browserSupportsWebAuthnAutofill.mockResolvedValue(true)

      renderPage(withReturnTo(authorize))

      await waitFor(() => expect(leaveTo).toHaveBeenCalledWith(authorize))
      expect(screen.queryByRole('heading', { name: 'Дашборд' })).toBeNull()
    })

    it('drops a return_to of another origin and lands on the dashboard', async () => {
      signInWithPasskey = mockSignInWithPasskey({ accountId: 'acc', credentialId: 'cred' })

      await signIn(withReturnTo('https://evil.example/'))

      await waitFor(() => expect(screen.getByRole('heading', { name: 'Дашборд' })).toBeDefined())
      expect(leaveTo).not.toHaveBeenCalled()
    })

    it('keeps it on both links to create account', async () => {
      signInWithPasskey = mockSignInWithPasskey.error('invalid_credential')
      const carried = `${routes.CREATE_ACCOUNT}?${new URLSearchParams({ return_to: authorize }).toString()}`

      renderPage(withReturnTo(authorize))

      expect((await screen.findByRole('link', { name: 'Создать' })).getAttribute('href')).toBe(carried)
      await userEvent.setup().click(screen.getByRole('button', { name: 'Войти с пасскеем' }))
      const alert = await screen.findByRole('alert')
      expect(within(alert).getByRole('link', { name: 'Создать аккаунт' }).getAttribute('href')).toBe(carried)
    })

    it('does not leave when an offer resolves after the screen was left', async () => {
      let pick: (value: unknown) => void = () => {}
      browserSupportsWebAuthnAutofill.mockResolvedValue(true)
      startAuthentication.mockReturnValueOnce(
        new Promise(resolve => {
          pick = resolve
        }),
      )
      renderPage(withReturnTo(authorize))
      await waitFor(() => expect(startAuthentication).toHaveBeenCalledOnce())

      cleanup()
      await finishLateOffer(pick)

      expect(leaveTo).not.toHaveBeenCalled()
    })

    it('does not leave when an offer resolves after the button started its own ceremony', async () => {
      let pick: (value: unknown) => void = () => {}
      browserSupportsWebAuthnAutofill.mockResolvedValue(true)
      startAuthentication.mockReturnValueOnce(
        new Promise(resolve => {
          pick = resolve
        }),
      )
      startAuthentication.mockImplementationOnce(pendingCeremony)

      renderPage(withReturnTo(authorize))
      await waitFor(() => expect(startAuthentication).toHaveBeenCalledOnce())
      await userEvent.setup().click(screen.getByRole('button', { name: 'Войти с пасскеем' }))
      await waitFor(() => expect(startAuthentication).toHaveBeenCalledTimes(2))
      await finishLateOffer(pick)

      expect(leaveTo).not.toHaveBeenCalled()
      expect(screen.getByRole('button', { name: 'Подтвердите пасскей…' })).toBeDefined()
    })
  })
})
