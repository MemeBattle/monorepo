import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'

import { appRoutes } from './router'
import { routes } from './routes'

const renderAt = (path: string) => render(<RouterProvider router={createMemoryRouter(appRoutes, { initialEntries: [path] })} />)

describe('appRoutes', () => {
  it('renders the dashboard at the index route', async () => {
    renderAt(routes.DASHBOARD)

    expect(await screen.findByRole('heading', { name: 'Личный кабинет' })).toBeTruthy()
  })

  it('renders the sign-in page', async () => {
    renderAt(routes.SIGN_IN)

    expect(await screen.findByRole('heading', { name: 'Вход' })).toBeTruthy()
  })

  it('renders the create-account page', async () => {
    renderAt(routes.CREATE_ACCOUNT)

    expect(await screen.findByRole('heading', { name: 'Создать аккаунт' })).toBeTruthy()
  })
})
