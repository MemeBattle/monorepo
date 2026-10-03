import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { mockSignInWithPasskey } from '#entities/session/testing'
import { routes } from '#app/routes'
import { SignInPage } from './SignInPage'

const { startAuthentication, browserSupportsWebAuthnAutofill, cancelCeremony } = vi.hoisted(() => ({
  startAuthentication: vi.fn(),
  browserSupportsWebAuthnAutofill: vi.fn(),
  cancelCeremony: vi.fn(),
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
    signInWithPasskey = mockSignInWithPasskey()
    browserSupportsWebAuthnAutofill.mockReset().mockResolvedValue(false)
    startAuthentication.mockReset().mockResolvedValue({ id: 'cred' })
    cancelCeremony.mockReset()
  })

  afterEach(() => {
    // No `globals` in the vitest config, so testing-library does not unmount on its own.
    cleanup()
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
      return new Promise(() => {})
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
})
