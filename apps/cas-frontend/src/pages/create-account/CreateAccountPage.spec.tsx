import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { aMe, mockGetMe, mockRegisterWithPasskey } from '#entities/session/testing'
import { routes } from '#app/routes'
import { CreateAccountPage } from './CreateAccountPage'
import { messages } from './validateDisplayName'

const { startRegistration, leaveTo, pageLoader } = vi.hoisted(() => ({ startRegistration: vi.fn(), leaveTo: vi.fn(), pageLoader: vi.fn() }))
vi.mock('@simplewebauthn/browser', async importOriginal => ({
  ...(await importOriginal<typeof import('@simplewebauthn/browser')>()),
  startRegistration,
}))
let registerWithPasskey: ReturnType<typeof mockRegisterWithPasskey>
let getMe: ReturnType<typeof mockGetMe>

// Only the document navigation is faked; `readReturnTo` and `ReturnToLink` stay real.
vi.mock('#app/returnTo', async importOriginal => ({ ...(await importOriginal<typeof import('#app/returnTo')>()), leaveTo }))

/** The authorization request CAS sends the browser back to, and the create-account screen it opens. */
const authorize = '/oidc/authorize?client_id=x&state=s'
const withReturnTo = (value: string) => `${routes.CREATE_ACCOUNT}?${new URLSearchParams({ return_to: value }).toString()}`

/**
 * The real `leaveTo` never settles, the browser leaves; the fake stays
 * pending until the test is over and is settled then: React entangles a
 * pending action with every later transition, so an action that never ends
 * would hold back the next test's navigations.
 */
let releaseLeaving: () => void = () => {}
const pendingLeave = () =>
  new Promise<never>(resolve => {
    releaseLeaving = () => resolve(undefined as never)
  })

// The fixed challenge fixture encodes this UUID as its WebAuthn user handle.
const guest = aMe({ accountId: '0191e2a4-5b6c-7d8e-9fa0-b1c2d3e4f506', displayName: 'Guest 7', accountType: 'guest' })
const plainSubtitle = 'Придумайте имя, остальное сделает браузер. Пароля не будет.'
const upgradeSubtitle =
  'Игровой прогресс останется с вами: гостевой аккаунт станет постоянным. Придумайте имя, остальное сделает браузер. Пароля не будет.'

/**
 * With `loaded`, the route has a loader in place of the gate: `pageLoader`,
 * which answers what each case sets up. Without it, no loader, as a plain
 * create-account behind a gate that found no session.
 */
const renderPage = (entry: string = routes.CREATE_ACCOUNT, loaded = false) => {
  const router = createMemoryRouter(
    [
      loaded
        ? { path: routes.CREATE_ACCOUNT, loader: pageLoader, element: <CreateAccountPage />, HydrateFallback: () => null }
        : { path: routes.CREATE_ACCOUNT, element: <CreateAccountPage /> },
      { path: routes.DASHBOARD, element: <h1>Дашборд</h1> },
    ],
    { initialEntries: [entry] },
  )
  render(<RouterProvider router={router} />)
  return router
}

const submit = async (name: string, entry?: string, loaded = false) => {
  renderPage(entry, loaded)
  const user = userEvent.setup()
  if (name) {
    await user.type(await screen.findByLabelText('Имя'), name)
  }
  await user.click(screen.getByRole('button', { name: 'Создать пасскей' }))
}

describe('CreateAccountPage', () => {
  beforeEach(() => {
    getMe = mockGetMe()
    registerWithPasskey = mockRegisterWithPasskey()
    startRegistration.mockReset().mockResolvedValue({ id: 'cred' })
  })
  afterEach(() => {
    // No `globals` in the vitest config, so testing-library does not unmount on its own.
    cleanup()
    releaseLeaving()
    leaveTo.mockReset()
    pageLoader.mockReset()
  })

  it('runs the ceremony with the trimmed name and lands on the dashboard', async () => {
    registerWithPasskey = mockRegisterWithPasskey({ accountId: 'acc', credentialId: 'cred' })

    await submit('  Ада  ')

    await waitFor(() => expect(registerWithPasskey).toHaveBeenCalledWith({ displayName: 'Ада' }))
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Дашборд' })).toBeDefined())
  })

  it('sends a decomposed name near the cap in NFC instead of rejecting it', async () => {
    registerWithPasskey = mockRegisterWithPasskey({ accountId: 'acc', credentialId: 'cred' })

    await submit('é'.repeat(33))

    expect(screen.queryByText(messages.tooLong)).toBeNull()
    await waitFor(() => expect(registerWithPasskey).toHaveBeenCalledWith({ displayName: 'é'.repeat(33) }))
  })

  it('rejects an empty name before asking the server', async () => {
    await submit('')

    expect(registerWithPasskey).not.toHaveBeenCalled()
    const input = screen.getByLabelText('Имя')
    await waitFor(() => expect(input.getAttribute('aria-invalid')).toBe('true'))
    expect(screen.getByText(messages.empty)).toBeDefined()
  })

  it('shows the server verdict under the field and keeps the name', async () => {
    registerWithPasskey = mockRegisterWithPasskey.error('invalid_display_name')

    await submit('Ада​')

    await screen.findByText(messages.disallowed)
    expect(screen.getByLabelText<HTMLInputElement>('Имя').value).toBe('Ада​')
    expect(screen.queryByText('invalid_display_name')).toBeNull()
    expect(screen.getByRole('button', { name: 'Создать пасскей' })).toBeDefined()
  })

  it.each([
    ['a network failure', { networkError: true as const }, 'Failed to fetch'],
    ['an outage', { error: 'database_unavailable' as const }, 'database_unavailable'],
    ['a refused cross-site request', { error: 'cross_site_request' as const }, 'cross_site_request'],
    ['a verification the server could not do', { error: 'registration_verification_failed' as const }, 'registration_verification_failed'],
  ])('shows %s as the generic alert, never the raw message', async (_, error, raw) => {
    if (error instanceof DOMException) {
      startRegistration.mockRejectedValue(error)
    } else {
      registerWithPasskey = mockRegisterWithPasskey.respond(() => error)
    }

    await submit('Ада')

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Что-то пошло не так')
    expect(alert.textContent).not.toContain(raw)
  })

  it('shows a challenge the server no longer has as a cancelled ceremony', async () => {
    registerWithPasskey = mockRegisterWithPasskey.error('registration_not_found')

    await submit('Ада')

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Создание отменено')
    expect(alert.textContent).not.toContain('registration_not_found')
    expect(getMe).not.toHaveBeenCalled()
  })

  it.each([
    ['NotSupportedError', new DOMException('not supported', 'NotSupportedError')],
    ['ConstraintError', new DOMException('constraint', 'ConstraintError')],
    ['the server refusing a non-discoverable credential', { error: 'discoverable_credential_required' as const }],
  ])('explains an authenticator that cannot make a passkey (%s)', async (_, error) => {
    if (error instanceof DOMException) {
      startRegistration.mockRejectedValue(error)
    } else {
      registerWithPasskey = mockRegisterWithPasskey.respond(() => error)
    }

    await submit('Ада')

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Не получилось создать пасскей')
    expect(alert.textContent).toContain('Touch ID')
    expect(screen.getByRole('button', { name: 'Попробовать ещё раз' })).toBeDefined()
  })

  it.each([
    ['InvalidStateError', new DOMException('already registered', 'InvalidStateError')],
    ['the server knowing the credential', { error: 'credential_already_registered' as const }],
  ])('points a passkey that already exists here to sign-in (%s)', async (_, error) => {
    if (error instanceof DOMException) {
      startRegistration.mockRejectedValue(error)
    } else {
      registerWithPasskey = mockRegisterWithPasskey.respond(() => error)
    }

    await submit('Ада')

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Такой пасскей уже есть')
    expect(alert.textContent).not.toContain('credential_already_registered')
    expect(within(alert).getByRole('link', { name: 'Войти' }).getAttribute('href')).toBe(routes.SIGN_IN)
  })

  it('tells a page served from the wrong origin which address to open', async () => {
    startRegistration.mockRejectedValue(new DOMException('The operation is insecure.', 'SecurityError'))

    await submit('Ада')

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Этот адрес не подходит для входа')
    expect(alert.textContent).not.toContain('insecure')
  })

  it('shows a cancelled ceremony as an alert above a still usable form', async () => {
    startRegistration.mockRejectedValue(new DOMException('The operation either timed out or was not allowed.', 'NotAllowedError'))

    await submit('Ада')

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Создание отменено')
    expect(alert.textContent).not.toContain('not allowed')
    expect(screen.getByLabelText<HTMLInputElement>('Имя').value).toBe('Ада')
    expect(screen.getByRole('button', { name: 'Попробовать ещё раз' })).toBeDefined()
  })

  describe('opened with return_to', () => {
    it('leaves for it after the account is created, not for the dashboard', async () => {
      registerWithPasskey = mockRegisterWithPasskey({ accountId: 'acc', credentialId: 'cred' })
      leaveTo.mockImplementation(pendingLeave)

      await submit('Ада', withReturnTo(authorize))

      await waitFor(() => expect(leaveTo).toHaveBeenCalledWith(authorize))
      expect(screen.queryByRole('heading', { name: 'Дашборд' })).toBeNull()
    })

    it('drops a return_to of another origin and lands on the dashboard', async () => {
      registerWithPasskey = mockRegisterWithPasskey({ accountId: 'acc', credentialId: 'cred' })

      await submit('Ада', withReturnTo('https://evil.example/'))

      await waitFor(() => expect(screen.getByRole('heading', { name: 'Дашборд' })).toBeDefined())
      expect(leaveTo).not.toHaveBeenCalled()
    })

    it('keeps it on both links to sign-in', async () => {
      registerWithPasskey = mockRegisterWithPasskey.error('credential_already_registered')
      const carried = `${routes.SIGN_IN}?${new URLSearchParams({ return_to: authorize }).toString()}`

      renderPage(withReturnTo(authorize))

      expect(screen.getByRole('link', { name: 'Войти' }).getAttribute('href')).toBe(carried)
      const user = userEvent.setup()
      await user.type(screen.getByLabelText('Имя'), 'Ада')
      await user.click(screen.getByRole('button', { name: 'Создать пасскей' }))
      const alert = await screen.findByRole('alert')
      expect(within(alert).getByRole('link', { name: 'Войти' }).getAttribute('href')).toBe(carried)
    })
  })

  describe('opened by a guest', () => {
    it('says the plain words without a guest', () => {
      renderPage()

      expect(screen.getByText(plainSubtitle)).toBeDefined()
      expect(screen.queryByText(upgradeSubtitle)).toBeNull()
    })

    it('says that the game data stays', async () => {
      pageLoader.mockResolvedValue(guest)

      renderPage(routes.CREATE_ACCOUNT, true)

      expect(await screen.findByText(upgradeSubtitle)).toBeDefined()
      expect(screen.getByRole('heading', { name: 'Создать аккаунт' })).toBeDefined()
      expect(screen.getByRole('link', { name: 'Войти' })).toBeDefined()
    })

    it('upgrades the guest and leaves for return_to', async () => {
      pageLoader.mockResolvedValue(guest)
      registerWithPasskey = mockRegisterWithPasskey({ accountId: guest.accountId, credentialId: 'cred' })
      leaveTo.mockImplementation(pendingLeave)

      await submit('Ада', withReturnTo(authorize), true)

      await waitFor(() => expect(registerWithPasskey).toHaveBeenCalledWith({ displayName: 'Ада' }))
      expect(startRegistration).toHaveBeenCalledOnce()
      await waitFor(() => expect(leaveTo).toHaveBeenCalledWith(authorize))
    })

    it('upgrades the guest and lands on the dashboard without return_to', async () => {
      pageLoader.mockResolvedValue(guest)
      registerWithPasskey = mockRegisterWithPasskey({ accountId: guest.accountId, credentialId: 'cred' })

      await submit('Ада', routes.CREATE_ACCOUNT, true)

      await waitFor(() => expect(registerWithPasskey).toHaveBeenCalledWith({ displayName: 'Ада' }))
      expect(startRegistration).toHaveBeenCalledOnce()
      await waitFor(() => expect(screen.getByRole('heading', { name: 'Дашборд' })).toBeDefined())
      expect(getMe).not.toHaveBeenCalled()
    })

    it('says the session ended when the challenge is not the guest’s, and lets the gate decide again', async () => {
      // The gate finds no session once asked again.
      pageLoader.mockResolvedValueOnce({ ...guest, accountId: '11223344-5566-7788-99aa-bbccddeeff00' }).mockResolvedValue(null)

      await submit('Ада', routes.CREATE_ACCOUNT, true)

      const alert = await screen.findByRole('alert')
      expect(alert.textContent).toContain('Гостевая сессия закончилась')
      expect(pageLoader).toHaveBeenCalledTimes(2)
      expect(screen.getByText(plainSubtitle)).toBeDefined()
      expect(startRegistration).not.toHaveBeenCalled()
    })

    it('shows an expired challenge as a cancelled ceremony while the session is still the guest’s', async () => {
      pageLoader.mockResolvedValue(guest)
      registerWithPasskey = mockRegisterWithPasskey.error('registration_not_found')
      getMe = mockGetMe(guest)

      await submit('Ада', routes.CREATE_ACCOUNT, true)

      const alert = await screen.findByRole('alert')
      expect(alert.textContent).toContain('Создание отменено')
      expect(pageLoader).toHaveBeenCalledOnce()
      expect(screen.getByText(upgradeSubtitle)).toBeDefined()
    })

    it.each([
      ['no session', () => (getMe = mockGetMe.error('unauthenticated'))],
      ['a full account', () => (getMe = mockGetMe({ ...guest, displayName: 'Ада', accountType: 'full' }))],
      ['another guest', () => (getMe = mockGetMe({ ...guest, accountId: 'other' }))],
    ])('says the session ended when the challenge is gone and the browser now holds %s', async (_, session) => {
      pageLoader.mockResolvedValueOnce(guest).mockResolvedValue(null)
      registerWithPasskey = mockRegisterWithPasskey.error('registration_not_found')
      session()

      await submit('Ада', routes.CREATE_ACCOUNT, true)

      const alert = await screen.findByRole('alert')
      expect(alert.textContent).toContain('Гостевая сессия закончилась')
      expect(pageLoader).toHaveBeenCalledTimes(2)
    })

    it('shows the generic alert when the session cannot be read again', async () => {
      pageLoader.mockResolvedValue(guest)
      registerWithPasskey = mockRegisterWithPasskey.error('registration_not_found')
      getMe = mockGetMe.error('database_unavailable')

      await submit('Ада', routes.CREATE_ACCOUNT, true)

      const alert = await screen.findByRole('alert')
      expect(alert.textContent).toContain('Что-то пошло не так')
      expect(alert.textContent).not.toContain('Database unavailable')
    })

    it('says the session ended when CAS answers unauthenticated', async () => {
      pageLoader.mockResolvedValueOnce(guest).mockResolvedValue(null)
      registerWithPasskey = mockRegisterWithPasskey.error('unauthenticated')

      await submit('Ада', routes.CREATE_ACCOUNT, true)

      const alert = await screen.findByRole('alert')
      expect(alert.textContent).toContain('Гостевая сессия закончилась')
      expect(pageLoader).toHaveBeenCalledTimes(2)
    })
  })
})
