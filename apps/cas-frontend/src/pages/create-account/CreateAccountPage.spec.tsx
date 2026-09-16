import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '#shared/api/request'
import { routes } from '#app/routes'
import { CreateAccountPage } from './CreateAccountPage'
import { messages } from './validateDisplayName'

const { registerWithPasskey } = vi.hoisted(() => ({ registerWithPasskey: vi.fn() }))
// Only the ceremony is faked; `isCeremonyCancelled` stays real, so the spec covers the mapping too.
vi.mock('#entities/session', async importOriginal => ({ ...(await importOriginal<typeof import('#entities/session')>()), registerWithPasskey }))

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
  afterEach(() => {
    // No `globals` in the vitest config, so testing-library does not unmount on its own.
    cleanup()
    registerWithPasskey.mockReset()
  })

  it('runs the ceremony with the trimmed name and lands on the dashboard', async () => {
    registerWithPasskey.mockResolvedValue({ accountId: 'acc', credentialId: 'cred' })

    await submit('  Ада  ')

    expect(registerWithPasskey).toHaveBeenCalledWith('Ада')
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Дашборд' })).toBeDefined())
  })

  it('sends a decomposed name near the cap in NFC instead of rejecting it', async () => {
    registerWithPasskey.mockResolvedValue({ accountId: 'acc', credentialId: 'cred' })

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
    registerWithPasskey.mockRejectedValue(
      new ApiError(400, 'invalid_display_name', 'Invalid display name: must not contain control or invisible characters'),
    )

    await submit('Ада​')

    await screen.findByText(messages.disallowed)
    expect(screen.getByLabelText<HTMLInputElement>('Имя').value).toBe('Ада​')
    expect(screen.queryByText(/Invalid display name/)).toBeNull()
    expect(screen.getByRole('button', { name: 'Создать пасскей' })).toBeDefined()
  })

  it.each([
    ['a network failure', new TypeError('Failed to fetch'), 'Failed to fetch'],
    ['an outage', new ApiError(503, 'database_unavailable', 'Database unavailable'), 'Database unavailable'],
    ['a refused cross-site request', new ApiError(403, 'cross_site_request', 'Cross-site request refused'), 'Cross-site'],
    ['a verification the server could not do', new ApiError(400, 'registration_verification_failed', 'Attestation invalid'), 'Attestation'],
  ])('shows %s as the generic alert, never the raw message', async (_, error, raw) => {
    registerWithPasskey.mockRejectedValue(error)

    await submit('Ада')

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Что-то пошло не так')
    expect(alert.textContent).not.toContain(raw)
  })

  it('shows a challenge the server no longer has as a cancelled ceremony', async () => {
    registerWithPasskey.mockRejectedValue(new ApiError(404, 'registration_not_found', 'registration not found: expired'))

    await submit('Ада')

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Создание отменено')
    expect(alert.textContent).not.toContain('expired')
  })

  it.each([
    ['NotSupportedError', new DOMException('not supported', 'NotSupportedError')],
    ['ConstraintError', new DOMException('constraint', 'ConstraintError')],
    ['the server refusing a non-discoverable credential', new ApiError(400, 'discoverable_credential_required', 'Credential must be discoverable')],
  ])('explains an authenticator that cannot make a passkey (%s)', async (_, error) => {
    registerWithPasskey.mockRejectedValue(error)

    await submit('Ада')

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Не получилось создать пасскей')
    expect(alert.textContent).toContain('Touch ID')
    expect(screen.getByRole('button', { name: 'Попробовать ещё раз' })).toBeDefined()
  })

  it.each([
    ['InvalidStateError', new DOMException('already registered', 'InvalidStateError')],
    ['the server knowing the credential', new ApiError(409, 'credential_already_registered', 'Credential already registered')],
  ])('points a passkey that already exists here to sign-in (%s)', async (_, error) => {
    registerWithPasskey.mockRejectedValue(error)

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
})
