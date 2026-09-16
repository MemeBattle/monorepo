import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '#shared/api/request'
import { routes } from '#app/routes'
import { SignInPage } from './SignInPage'

const { signInWithPasskey } = vi.hoisted(() => ({ signInWithPasskey: vi.fn() }))
// Only the ceremony is faked; `isCeremonyCancelled` stays real, so the spec covers the mapping too.
vi.mock('#entities/session', async importOriginal => ({ ...(await importOriginal<typeof import('#entities/session')>()), signInWithPasskey }))

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
  await userEvent.setup().click(screen.getByRole('button', { name: 'Войти с пасскеем' }))
}

describe('SignInPage', () => {
  afterEach(() => {
    // No `globals` in the vitest config, so testing-library does not unmount on its own.
    cleanup()
    signInWithPasskey.mockReset()
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

  it('shows a failure it cannot name as the generic alert, never the raw message', async () => {
    signInWithPasskey.mockRejectedValue(new TypeError('Failed to fetch'))

    await signIn()

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Что-то пошло не так')
    expect(alert.textContent).not.toContain('Failed to fetch')
  })
})
