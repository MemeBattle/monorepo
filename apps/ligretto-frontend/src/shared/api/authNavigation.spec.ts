// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'

import { LIGRETTO_CORE_URL } from '#shared/constants/config'

import { navigateToLogout, navigateToSignIn, restartOnHome } from './authNavigation'

const assign = vi.fn()

describe('auth navigation', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    assign.mockReset()
  })

  it.each([
    { name: 'navigateToSignIn', navigate: navigateToSignIn, url: `${LIGRETTO_CORE_URL}/auth/sign-in` },
    { name: 'navigateToLogout', navigate: navigateToLogout, url: `${LIGRETTO_CORE_URL}/auth/logout` },
    { name: 'restartOnHome', navigate: restartOnHome, url: '/' },
  ])('$name navigates the window to $url', ({ navigate, url }) => {
    vi.stubGlobal('location', { ...window.location, assign })

    navigate()

    expect(assign).toHaveBeenCalledExactlyOnceWith(url)
  })
})
