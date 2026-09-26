import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { mockRegisterWithPasskey } from '#entities/session/testing'
import { routes } from '#app/routes'
import { CreateAccountPage } from './CreateAccountPage'
import { messages } from './validateDisplayName'

const { startRegistration } = vi.hoisted(() => ({ startRegistration: vi.fn() }))
vi.mock('@simplewebauthn/browser', async importOriginal => ({
  ...(await importOriginal<typeof import('@simplewebauthn/browser')>()),
  startRegistration,
}))
let registerWithPasskey: ReturnType<typeof mockRegisterWithPasskey>

const renderPage = () => {
  const router = createMemoryRouter(
    [
      { path: routes.CREATE_ACCOUNT, element: <CreateAccountPage /> },
      { path: routes.DASHBOARD, element: <h1>Дашборд</h1> },
    ],
    { initialEntries: [routes.CREATE_ACCOUNT] },
  )
  render(<RouterProvider router={router} />)
  return router
}

const submit = async (name: string) => {
  renderPage()
  const user = userEvent.setup()
  if (name) {
    await user.type(screen.getByLabelText('Имя'), name)
  }
  await user.click(screen.getByRole('button', { name: 'Создать пасскей' }))
}

describe('CreateAccountPage', () => {
  beforeEach(() => {
    registerWithPasskey = mockRegisterWithPasskey()
    startRegistration.mockReset().mockResolvedValue({ id: 'cred' })
  })
  afterEach(() => {
    // No `globals` in the vitest config, so testing-library does not unmount on its own.
    cleanup()
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
})
