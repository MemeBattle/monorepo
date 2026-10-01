import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '#shared/api/request'
import { routes } from '#app/routes'
import { SignInPage } from './SignInPage'

const { signInWithPasskey, signInWithPasskeyFromAutofill } = vi.hoisted(() => ({
  signInWithPasskey: vi.fn(),
  signInWithPasskeyFromAutofill: vi.fn(),
}))
// Only the ceremonies are faked; `isCeremonyCancelled` stays real, so the spec covers the mapping too.
vi.mock('#entities/session', async importOriginal => ({
  ...(await importOriginal<typeof import('#entities/session')>()),
  signInWithPasskey,
  signInWithPasskeyFromAutofill,
}))

/** An autofill offer nobody answers; the page ends it by aborting the signal. */
const standingOffer = () => new Promise<null>(() => {})

const renderPage = () => {
  const router = createMemoryRouter(
    [
      { path: routes.SIGN_IN, element: <SignInPage /> },
      { path: routes.DASHBOARD, element: <h1>Дашборд</h1> },
      { path: routes.CREATE_ACCOUNT, element: <h1>Создать аккаунт</h1> },
    ],
    { initialEntries: [routes.SIGN_IN] },
  )
  render(<RouterProvider router={router} />)
}

const signIn = async () => {
  renderPage()
  await screen.findByRole('button', { name: 'Войти с пасскеем' })
  await userEvent.setup().click(screen.getByRole('button', { name: 'Войти с пасскеем' }))
}

describe('SignInPage', () => {
  beforeEach(() => {
    signInWithPasskeyFromAutofill.mockReturnValue(standingOffer())
  })

  afterEach(() => {
    // No `globals` in the vitest config, so testing-library does not unmount on its own.
    cleanup()
    signInWithPasskey.mockReset()
    signInWithPasskeyFromAutofill.mockReset()
  })

  it('runs the ceremony and lands on the dashboard', async () => {
    signInWithPasskey.mockResolvedValue({ accountId: 'acc', credentialId: 'cred' })

    await signIn()

    expect(signInWithPasskey).toHaveBeenCalledOnce()
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Дашборд' })).toBeDefined())
  })

  it('points an unknown passkey to create account and offers another passkey', async () => {
    signInWithPasskey.mockRejectedValue(
      new ApiError(401, 'invalid_credential', 'The credential is not registered or the assertion could not be verified'),
    )

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
    signInWithPasskey.mockRejectedValue(new ApiError(404, 'login_not_found', 'login not found: expired, unknown or already finished'))

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
    ['a network failure', new TypeError('Failed to fetch'), 'Failed to fetch'],
    ['an outage', new ApiError(503, 'database_unavailable', 'Database unavailable'), 'Database unavailable'],
    ['a refused cross-site request', new ApiError(403, 'cross_site_request', 'Cross-site request refused'), 'Cross-site'],
  ])('shows %s as the generic alert, never the raw message', async (_, error, raw) => {
    signInWithPasskey.mockRejectedValue(error)

    await signIn()

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Что-то пошло не так')
    expect(alert.textContent).not.toContain(raw)
  })

  it('offers the passkey through autofill as soon as the screen is up and signs in with the pick', async () => {
    signInWithPasskeyFromAutofill.mockResolvedValue({ accountId: 'acc', credentialId: 'cred' })

    renderPage()

    expect(signInWithPasskeyFromAutofill).toHaveBeenCalledOnce()
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Дашборд' })).toBeDefined())
    expect(signInWithPasskey).not.toHaveBeenCalled()
  })

  it('shows what went wrong with a picked passkey the same way as for the button', async () => {
    signInWithPasskeyFromAutofill.mockRejectedValue(new ApiError(401, 'invalid_credential', 'not registered'))

    renderPage()

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Этот пасскей здесь не зарегистрирован')
    expect(screen.getByRole('button', { name: 'Выбрать другой пасскей' })).toBeDefined()
  })

  it('withdraws the autofill offer before the button starts its own ceremony', async () => {
    signInWithPasskey.mockReturnValue(new Promise(() => {}))

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
})
