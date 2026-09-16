import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '#shared/api/request'
import { requireSession } from '#app/gates'
import { routes } from '#app/routes'
import { DashboardPage } from './DashboardPage'

const { getMe, logout } = vi.hoisted(() => ({ getMe: vi.fn(), logout: vi.fn() }))
vi.mock('#entities/session', () => ({ getMe, logout }))

const me = { accountId: 'acc', displayName: 'Ада', accountType: 'full', email: null, sessionExpiresAt: '2026-09-17T00:00:00Z' }

/** The real gate in front of the page, so the spec covers what the revalidation after sign-out does. */
const renderPage = () => {
  const router = createMemoryRouter(
    [
      { path: routes.DASHBOARD, loader: requireSession, element: <DashboardPage />, HydrateFallback: () => null },
      { path: routes.SIGN_IN, element: <h1>Вход</h1> },
    ],
    { initialEntries: [routes.DASHBOARD] },
  )
  render(<RouterProvider router={router} />)
}

const signOut = async () => {
  renderPage()
  await screen.findByRole('heading', { name: 'Ада' })
  await userEvent.setup().click(screen.getByRole('button', { name: 'Выйти' }))
}

describe('DashboardPage', () => {
  afterEach(() => {
    // No `globals` in the vitest config, so testing-library does not unmount on its own.
    cleanup()
    getMe.mockReset()
    logout.mockReset()
  })

  it('ends the session and lands on sign-in', async () => {
    getMe.mockResolvedValue(me)
    // Once the cookie is gone `/api/me` answers 401, which is what the revalidation sees.
    logout.mockImplementation(async () => {
      getMe.mockRejectedValue(new ApiError(401, 'unauthenticated', 'No live session'))
    })

    await signOut()

    expect(logout).toHaveBeenCalledOnce()
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Вход' })).toBeDefined())
  })

  it('stays on the dashboard with an alert when sign-out fails, never the raw message', async () => {
    getMe.mockResolvedValue(me)
    logout.mockRejectedValue(new TypeError('Failed to fetch'))

    await signOut()

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Не получилось выйти')
    expect(alert.textContent).not.toContain('Failed to fetch')
    expect(screen.getByRole('heading', { name: 'Ада' })).toBeDefined()
    expect(screen.getByRole('button', { name: 'Выйти' })).toBeDefined()
  })
})
