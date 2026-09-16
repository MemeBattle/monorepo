import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '#shared/api/request'
import { routes } from '#app/routes'
import { DashboardPage } from './DashboardPage'
import { loadDashboard } from './loadDashboard'

const { getMe, logout, listPasskeys } = vi.hoisted(() => ({ getMe: vi.fn(), logout: vi.fn(), listPasskeys: vi.fn() }))
vi.mock('#entities/session', () => ({ getMe, logout }))
vi.mock('#entities/passkey', () => ({ listPasskeys }))

const me = { accountId: 'acc', displayName: 'Ада', accountType: 'full', email: null, sessionExpiresAt: '2026-09-17T00:00:00Z' }
const today = new Date().toISOString()
const passkeys = [
  { id: 'p1', name: 'Пасскей', createdAt: today, lastUsedAt: null },
  { id: 'p2', name: 'iPhone Ады', createdAt: '2025-12-31T12:00:00Z', lastUsedAt: today },
]

/** The real loader in front of the page, so the spec covers what the revalidation after sign-out does. */
const renderPage = () => {
  const router = createMemoryRouter(
    [
      { path: routes.DASHBOARD, loader: loadDashboard, element: <DashboardPage />, HydrateFallback: () => null },
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
  beforeEach(() => {
    listPasskeys.mockResolvedValue(passkeys)
  })

  afterEach(() => {
    // No `globals` in the vitest config, so testing-library does not unmount on its own.
    cleanup()
    getMe.mockReset()
    logout.mockReset()
    listPasskeys.mockReset()
  })

  it('lists the passkeys with when they were made and last used', async () => {
    getMe.mockResolvedValue(me)

    renderPage()

    const items = await screen.findAllByRole('listitem')
    expect(items.map(item => item.textContent)).toEqual([
      'ПасскейСоздан сегодня · Не использовался',
      'iPhone АдыСоздан 31 декабря 2025 г. · Использован сегодня',
    ])
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
