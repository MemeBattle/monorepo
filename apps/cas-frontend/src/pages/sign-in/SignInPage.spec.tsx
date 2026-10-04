import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError, failed, ok } from '#shared/api/client'
import { routes } from '#app/routes'
import { SignInPage } from './SignInPage'

const { signInWithPasskey, signInWithPasskeyFromAutofill, leaveTo } = vi.hoisted(() => ({
  signInWithPasskey: vi.fn(),
  signInWithPasskeyFromAutofill: vi.fn(),
  leaveTo: vi.fn(),
}))
// Only the ceremonies are faked; `isCeremonyCancelled` stays real, so the spec covers the mapping too.
vi.mock('#entities/session', async importOriginal => ({
  ...(await importOriginal<typeof import('#entities/session')>()),
  signInWithPasskey,
  signInWithPasskeyFromAutofill,
}))

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

/** An autofill offer nobody answers; the page ends it by aborting the signal. */
const standingOffer = () => new Promise<null>(() => {})

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
    signInWithPasskeyFromAutofill.mockReturnValue(standingOffer())
    leaveTo.mockImplementation(pendingLeave)
  })

  afterEach(() => {
    // No `globals` in the vitest config, so testing-library does not unmount on its own.
    cleanup()
    for (const settle of unsettled.splice(0)) {
      settle()
    }
    signInWithPasskey.mockReset()
    signInWithPasskeyFromAutofill.mockReset()
    leaveTo.mockReset()
  })

  it('runs the ceremony and lands on the dashboard', async () => {
    signInWithPasskey.mockResolvedValue(ok({ accountId: 'acc', credentialId: 'cred' }))

    await signIn()

    expect(signInWithPasskey).toHaveBeenCalledOnce()
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Дашборд' })).toBeDefined())
  })

  it('points an unknown passkey to create account and offers another passkey', async () => {
    signInWithPasskey.mockResolvedValue(failed(401, 'invalid_credential', 'The credential is not registered or the assertion could not be verified'))

    await signIn()

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Этот пасскей здесь не зарегистрирован')
    expect(alert.textContent).not.toContain('not registered')
    expect(screen.getByRole('link', { name: 'Создать аккаунт' }).getAttribute('href')).toBe(routes.CREATE_ACCOUNT)
    expect(screen.getByRole('button', { name: 'Выбрать другой пасскей' })).toBeDefined()
  })

  it('shows a cancelled ceremony as an alert above a still usable form', async () => {
    signInWithPasskey.mockRejectedValue(new DOMException('The operation either timed out or was not allowed.', 'NotAllowedError'))

    await signIn()

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Вход отменён')
    expect(alert.textContent).not.toContain('not allowed')
    expect(screen.getByRole('button', { name: 'Попробовать ещё раз' })).toBeDefined()
  })

  it('shows a challenge the server no longer has as a cancelled ceremony', async () => {
    signInWithPasskey.mockResolvedValue(failed(404, 'login_not_found', 'login not found: expired, unknown or already finished'))

    await signIn()

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Вход отменён')
    expect(alert.textContent).not.toContain('expired')
  })

  it('tells a page served from the wrong origin which address to open', async () => {
    signInWithPasskey.mockRejectedValue(new DOMException('The operation is insecure.', 'SecurityError'))

    await signIn()

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Этот адрес не подходит для входа')
    expect(alert.textContent).not.toContain('insecure')
  })

  it.each([
    ['a network failure', () => Promise.reject(new TypeError('Failed to fetch')), 'Failed to fetch'],
    ['an outage', () => Promise.reject(new ApiError(503, 'database_unavailable', 'Database unavailable')), 'Database unavailable'],
    ['a refused cross-site request', () => Promise.resolve(failed(403, 'cross_site_request', 'Cross-site request refused')), 'Cross-site'],
  ])('shows %s as the generic alert, never the raw message', async (_, answer, raw) => {
    signInWithPasskey.mockImplementation(answer)

    await signIn()

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Что-то пошло не так')
    expect(alert.textContent).not.toContain(raw)
  })

  it('offers the passkey through autofill as soon as the screen is up and signs in with the pick', async () => {
    signInWithPasskeyFromAutofill.mockResolvedValue(ok({ accountId: 'acc', credentialId: 'cred' }))

    renderPage()

    expect(signInWithPasskeyFromAutofill).toHaveBeenCalledOnce()
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Дашборд' })).toBeDefined())
    expect(signInWithPasskey).not.toHaveBeenCalled()
  })

  it('shows what went wrong with a picked passkey the same way as for the button', async () => {
    signInWithPasskeyFromAutofill.mockResolvedValue(failed(401, 'invalid_credential', 'not registered'))

    renderPage()

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Этот пасскей здесь не зарегистрирован')
    expect(screen.getByRole('button', { name: 'Выбрать другой пасскей' })).toBeDefined()
  })

  it('withdraws the autofill offer before the button starts its own ceremony', async () => {
    signInWithPasskey.mockReturnValue(pendingCeremony())

    await signIn()

    const [signal] = signInWithPasskeyFromAutofill.mock.calls[0] as [AbortSignal]
    expect(signal.aborted).toBe(true)
    expect(signInWithPasskey).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: 'Подтвердите пасскей…' })).toBeDefined()
  })

  it('withdraws the autofill offer when the screen is left', async () => {
    renderPage()
    await screen.findByRole('button', { name: 'Войти с пасскеем' })

    cleanup()

    const [signal] = signInWithPasskeyFromAutofill.mock.calls[0] as [AbortSignal]
    expect(signal.aborted).toBe(true)
  })

  describe('opened with return_to', () => {
    it('leaves for it after the button signs in, not for the dashboard', async () => {
      signInWithPasskey.mockResolvedValue(ok({ accountId: 'acc', credentialId: 'cred' }))

      await signIn(withReturnTo(authorize))

      await waitFor(() => expect(leaveTo).toHaveBeenCalledWith(authorize))
      expect(screen.queryByRole('heading', { name: 'Дашборд' })).toBeNull()
      // The button keeps its pending state until the browser has left.
      expect(screen.getByRole('button', { name: 'Подтвердите пасскей…' })).toBeDefined()
    })

    it('leaves for it after the autofill offer signs in', async () => {
      signInWithPasskeyFromAutofill.mockResolvedValue(ok({ accountId: 'acc', credentialId: 'cred' }))

      renderPage(withReturnTo(authorize))

      await waitFor(() => expect(leaveTo).toHaveBeenCalledWith(authorize))
      expect(screen.queryByRole('heading', { name: 'Дашборд' })).toBeNull()
    })

    it('drops a return_to of another origin and lands on the dashboard', async () => {
      signInWithPasskey.mockResolvedValue(ok({ accountId: 'acc', credentialId: 'cred' }))

      await signIn(withReturnTo('https://evil.example/'))

      await waitFor(() => expect(screen.getByRole('heading', { name: 'Дашборд' })).toBeDefined())
      expect(leaveTo).not.toHaveBeenCalled()
    })

    it('keeps it on both links to create account', async () => {
      signInWithPasskey.mockResolvedValue(failed(401, 'invalid_credential', 'not registered'))
      const carried = `${routes.CREATE_ACCOUNT}?${new URLSearchParams({ return_to: authorize }).toString()}`

      renderPage(withReturnTo(authorize))

      expect((await screen.findByRole('link', { name: 'Создать' })).getAttribute('href')).toBe(carried)
      await userEvent.setup().click(screen.getByRole('button', { name: 'Войти с пасскеем' }))
      const alert = await screen.findByRole('alert')
      expect(within(alert).getByRole('link', { name: 'Создать аккаунт' }).getAttribute('href')).toBe(carried)
    })

    it('does not leave when an offer resolves after the screen was left', async () => {
      let pick: (value: unknown) => void = () => {}
      signInWithPasskeyFromAutofill.mockReturnValue(new Promise(resolve => (pick = resolve)))
      renderPage(withReturnTo(authorize))
      await screen.findByRole('button', { name: 'Войти с пасскеем' })

      cleanup()
      pick({ accountId: 'acc', credentialId: 'cred' })
      await Promise.resolve()

      expect(leaveTo).not.toHaveBeenCalled()
    })

    it('does not leave when an offer resolves after the button started its own ceremony', async () => {
      let pick: (value: unknown) => void = () => {}
      signInWithPasskeyFromAutofill.mockReturnValue(new Promise(resolve => (pick = resolve)))
      signInWithPasskey.mockReturnValue(pendingCeremony())

      await signIn(withReturnTo(authorize))
      await screen.findByRole('button', { name: 'Подтвердите пасскей…' })
      pick({ accountId: 'acc', credentialId: 'cred' })
      await Promise.resolve()

      expect(leaveTo).not.toHaveBeenCalled()
      expect(screen.getByRole('button', { name: 'Подтвердите пасскей…' })).toBeDefined()
    })
  })
})
