import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '#shared/api/request'
import { routes } from '#app/routes'
import { CreateAccountPage } from './CreateAccountPage'
import { messages } from './validateDisplayName'

const { registerWithPasskey } = vi.hoisted(() => ({ registerWithPasskey: vi.fn() }))
vi.mock('#entities/session', () => ({ registerWithPasskey }))

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
