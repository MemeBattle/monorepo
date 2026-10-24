// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { UserInfo } from './UserInfo'

describe('UserInfo', () => {
  it('offers a guest the sign-in and no logout', () => {
    render(<UserInfo isGuest />)

    expect(screen.getByText('Sign in')).toBeTruthy()
    expect(screen.queryByTitle('logout')).toBeNull()
  })

  it('shows a full account its name and a working logout', () => {
    const onLogoutClick = vi.fn()
    render(<UserInfo isGuest={false} displayName="Ann" onLogoutClick={onLogoutClick} />)

    expect(screen.getByText('Ann')).toBeTruthy()
    fireEvent.click(screen.getByTitle('logout'))

    expect(onLogoutClick).toHaveBeenCalledTimes(1)
  })
})
