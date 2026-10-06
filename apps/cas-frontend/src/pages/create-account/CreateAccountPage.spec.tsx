import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { isNotTheGuest } from '#entities/session'
import { ApiError, failed, ok } from '#shared/api/client'
import { routes } from '#app/routes'
import { CreateAccountPage } from './CreateAccountPage'
import { messages } from './validateDisplayName'

const { registerWithPasskey, getMe, leaveTo, pageLoader } = vi.hoisted(() => ({
  registerWithPasskey: vi.fn(),
  getMe: vi.fn(),
  leaveTo: vi.fn(),
  pageLoader: vi.fn(),
}))
// Only the calls are faked; `isCeremonyCancelled` and `isNotTheGuest` stay real, so the spec covers the mapping too.
vi.mock('#entities/session', async importOriginal => ({
  ...(await importOriginal<typeof import('#entities/session')>()),
  registerWithPasskey,
  getMe,
}))

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

const guest = { accountId: 'g', displayName: 'Guest 7', accountType: 'guest', email: null, sessionExpiresAt: '2026-09-17T00:00:00Z' }
const plainSubtitle = 'Придумайте имя, остальное сделает браузер. Пароля не будет.'
const upgradeSubtitle =
  'Игровой прогресс останется с вами: гостевой аккаунт станет постоянным. Придумайте имя, остальное сделает браузер. Пароля не будет.'

/** What `registerWithPasskey` throws when the challenge is not the guest's; only its name tells it apart. */
const notTheGuest = () => Object.assign(new Error('not the guest'), { name: 'NotTheGuestError' })

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
  afterEach(() => {
    // No `globals` in the vitest config, so testing-library does not unmount on its own.
    cleanup()
    releaseLeaving()
    registerWithPasskey.mockReset()
    getMe.mockReset()
    leaveTo.mockReset()
    pageLoader.mockReset()
  })

  it('runs the ceremony with the trimmed name and lands on the dashboard', async () => {
    registerWithPasskey.mockResolvedValue(ok({ accountId: 'acc', credentialId: 'cred' }))

    await submit('  Ада  ')

    // A plain registration passes no guest: the call is the name alone.
    expect(registerWithPasskey.mock.calls).toEqual([['Ада']])
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Дашборд' })).toBeDefined())
  })

  it('sends a decomposed name near the cap in NFC instead of rejecting it', async () => {
    registerWithPasskey.mockResolvedValue(ok({ accountId: 'acc', credentialId: 'cred' }))

    await submit('é'.repeat(33))

    expect(screen.queryByText(messages.tooLong)).toBeNull()
    expect(registerWithPasskey).toHaveBeenCalledWith('é'.repeat(33))
  })

  it('rejects an empty name before asking the server', async () => {
    await submit('')

    expect(registerWithPasskey).not.toHaveBeenCalled()
    const input = screen.getByLabelText('Имя')
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(screen.getByText(messages.empty)).toBeDefined()
  })

  it('shows the server verdict under the field and keeps the name', async () => {
    registerWithPasskey.mockResolvedValue(
      failed(400, 'invalid_display_name', 'Invalid display name: must not contain control or invisible characters'),
    )

    await submit('Ада​')

    await screen.findByText(messages.disallowed)
    expect(screen.getByLabelText<HTMLInputElement>('Имя').value).toBe('Ада​')
    expect(screen.queryByText(/Invalid display name/)).toBeNull()
    expect(screen.getByRole('button', { name: 'Создать пасскей' })).toBeDefined()
  })

  it.each([
    ['a network failure', () => Promise.reject(new TypeError('Failed to fetch')), 'Failed to fetch'],
    ['an outage', () => Promise.reject(new ApiError(503, 'database_unavailable', 'Database unavailable')), 'Database unavailable'],
    ['a refused cross-site request', () => Promise.resolve(failed(403, 'cross_site_request', 'Cross-site request refused')), 'Cross-site'],
    [
      'a verification the server could not do',
      () => Promise.resolve(failed(400, 'registration_verification_failed', 'Attestation invalid')),
      'Attestation',
    ],
  ])('shows %s as the generic alert, never the raw message', async (_, answer, raw) => {
    registerWithPasskey.mockImplementation(answer)

    await submit('Ада')

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Что-то пошло не так')
    expect(alert.textContent).not.toContain(raw)
  })

  it('shows a challenge the server no longer has as a cancelled ceremony', async () => {
    registerWithPasskey.mockResolvedValue(failed(404, 'registration_not_found', 'registration not found: expired'))

    await submit('Ада')

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Создание отменено')
    expect(alert.textContent).not.toContain('expired')
    expect(getMe).not.toHaveBeenCalled()
  })

  it.each([
    ['NotSupportedError', () => Promise.reject(new DOMException('not supported', 'NotSupportedError'))],
    ['ConstraintError', () => Promise.reject(new DOMException('constraint', 'ConstraintError'))],
    [
      'the server refusing a non-discoverable credential',
      () => Promise.resolve(failed(400, 'discoverable_credential_required', 'Credential must be discoverable')),
    ],
  ])('explains an authenticator that cannot make a passkey (%s)', async (_, answer) => {
    registerWithPasskey.mockImplementation(answer)

    await submit('Ада')

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Не получилось создать пасскей')
    expect(alert.textContent).toContain('Touch ID')
    expect(screen.getByRole('button', { name: 'Попробовать ещё раз' })).toBeDefined()
  })

  it.each([
    ['InvalidStateError', () => Promise.reject(new DOMException('already registered', 'InvalidStateError'))],
    ['the server knowing the credential', () => Promise.resolve(failed(409, 'credential_already_registered', 'Credential already registered'))],
  ])('points a passkey that already exists here to sign-in (%s)', async (_, answer) => {
    registerWithPasskey.mockImplementation(answer)

    await submit('Ада')

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Такой пасскей уже есть')
    expect(alert.textContent).not.toContain('already registered')
    expect(within(alert).getByRole('link', { name: 'Войти' }).getAttribute('href')).toBe(routes.SIGN_IN)
  })

  it('tells a page served from the wrong origin which address to open', async () => {
    registerWithPasskey.mockRejectedValue(new DOMException('The operation is insecure.', 'SecurityError'))

    await submit('Ада')

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Этот адрес не подходит для входа')
    expect(alert.textContent).not.toContain('insecure')
  })

  it('shows a cancelled ceremony as an alert above a still usable form', async () => {
    registerWithPasskey.mockRejectedValue(new DOMException('The operation either timed out or was not allowed.', 'NotAllowedError'))

    await submit('Ада')

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Создание отменено')
    expect(alert.textContent).not.toContain('not allowed')
    expect(screen.getByLabelText<HTMLInputElement>('Имя').value).toBe('Ада')
    expect(screen.getByRole('button', { name: 'Попробовать ещё раз' })).toBeDefined()
  })

  describe('opened with return_to', () => {
    it('leaves for it after the account is created, not for the dashboard', async () => {
      registerWithPasskey.mockResolvedValue(ok({ accountId: 'acc', credentialId: 'cred' }))
      leaveTo.mockImplementation(pendingLeave)

      await submit('Ада', withReturnTo(authorize))

      await waitFor(() => expect(leaveTo).toHaveBeenCalledWith(authorize))
      expect(screen.queryByRole('heading', { name: 'Дашборд' })).toBeNull()
    })

    it('drops a return_to of another origin and lands on the dashboard', async () => {
      registerWithPasskey.mockResolvedValue(ok({ accountId: 'acc', credentialId: 'cred' }))

      await submit('Ада', withReturnTo('https://evil.example/'))

      await waitFor(() => expect(screen.getByRole('heading', { name: 'Дашборд' })).toBeDefined())
      expect(leaveTo).not.toHaveBeenCalled()
    })

    it('keeps it on both links to sign-in', async () => {
      registerWithPasskey.mockResolvedValue(failed(409, 'credential_already_registered', 'Credential already registered'))
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

    it('says that the data stays', async () => {
      pageLoader.mockResolvedValue(guest)

      renderPage(routes.CREATE_ACCOUNT, true)

      expect(await screen.findByText(upgradeSubtitle)).toBeDefined()
      expect(screen.getByRole('heading', { name: 'Создать аккаунт' })).toBeDefined()
      expect(screen.getByRole('link', { name: 'Войти' })).toBeDefined()
    })

    it('upgrades the guest and leaves for return_to', async () => {
      pageLoader.mockResolvedValue(guest)
      registerWithPasskey.mockResolvedValue(ok({ accountId: 'g', credentialId: 'cred' }))
      leaveTo.mockImplementation(pendingLeave)

      await submit('Ада', withReturnTo(authorize), true)

      expect(registerWithPasskey).toHaveBeenCalledWith('Ада', { accountId: 'g' })
      await waitFor(() => expect(leaveTo).toHaveBeenCalledWith(authorize))
    })

    it('upgrades the guest and lands on the dashboard without return_to', async () => {
      pageLoader.mockResolvedValue(guest)
      registerWithPasskey.mockResolvedValue(ok({ accountId: 'g', credentialId: 'cred' }))

      await submit('Ада', routes.CREATE_ACCOUNT, true)

      expect(registerWithPasskey).toHaveBeenCalledWith('Ада', { accountId: 'g' })
      await waitFor(() => expect(screen.getByRole('heading', { name: 'Дашборд' })).toBeDefined())
      expect(getMe).not.toHaveBeenCalled()
    })

    it('says the session ended when the challenge is not the guest’s, and lets the gate decide again', async () => {
      expect(isNotTheGuest(notTheGuest())).toBe(true)
      // The gate finds no session once asked again.
      pageLoader.mockResolvedValueOnce(guest).mockResolvedValue(null)
      registerWithPasskey.mockRejectedValue(notTheGuest())

      await submit('Ада', routes.CREATE_ACCOUNT, true)

      const alert = await screen.findByRole('alert')
      expect(alert.textContent).toContain('Гостевая сессия закончилась')
      expect(pageLoader).toHaveBeenCalledTimes(2)
      expect(screen.getByText(plainSubtitle)).toBeDefined()
    })

    it('shows an expired challenge as a cancelled ceremony while the session is still the guest’s', async () => {
      pageLoader.mockResolvedValue(guest)
      registerWithPasskey.mockResolvedValue(failed(404, 'registration_not_found', 'registration not found'))
      getMe.mockResolvedValue(ok(guest))

      await submit('Ада', routes.CREATE_ACCOUNT, true)

      const alert = await screen.findByRole('alert')
      expect(alert.textContent).toContain('Создание отменено')
      expect(pageLoader).toHaveBeenCalledOnce()
      expect(screen.getByText(upgradeSubtitle)).toBeDefined()
    })

    it.each([
      ['no session', () => getMe.mockResolvedValue(failed(401, 'unauthenticated', 'No live session'))],
      ['a full account', () => getMe.mockResolvedValue(ok({ ...guest, displayName: 'Ада', accountType: 'full' }))],
      ['another guest', () => getMe.mockResolvedValue(ok({ ...guest, accountId: 'other' }))],
    ])('says the session ended when the challenge is gone and the browser now holds %s', async (_, session) => {
      pageLoader.mockResolvedValueOnce(guest).mockResolvedValue(null)
      registerWithPasskey.mockResolvedValue(failed(404, 'registration_not_found', 'registration not found'))
      session()

      await submit('Ада', routes.CREATE_ACCOUNT, true)

      const alert = await screen.findByRole('alert')
      expect(alert.textContent).toContain('Гостевая сессия закончилась')
      expect(pageLoader).toHaveBeenCalledTimes(2)
    })

    it('shows the generic alert when the session cannot be read again', async () => {
      pageLoader.mockResolvedValue(guest)
      registerWithPasskey.mockResolvedValue(failed(404, 'registration_not_found', 'registration not found'))
      getMe.mockRejectedValue(new ApiError(503, 'database_unavailable', 'Database unavailable'))

      await submit('Ада', routes.CREATE_ACCOUNT, true)

      const alert = await screen.findByRole('alert')
      expect(alert.textContent).toContain('Что-то пошло не так')
      expect(alert.textContent).not.toContain('Database unavailable')
    })

    it('says the session ended when CAS answers unauthenticated', async () => {
      pageLoader.mockResolvedValueOnce(guest).mockResolvedValue(null)
      registerWithPasskey.mockResolvedValue(failed(401, 'unauthenticated', 'Sign in to continue'))

      await submit('Ада', routes.CREATE_ACCOUNT, true)

      const alert = await screen.findByRole('alert')
      expect(alert.textContent).toContain('Гостевая сессия закончилась')
      expect(pageLoader).toHaveBeenCalledTimes(2)
    })
  })
})
