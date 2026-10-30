import { describe, expect, it } from 'vitest'

import { LIGRETTO_CORE_URL } from '#shared/constants/config'

import { AUTH_LOGOUT_URL, AUTH_SIGN_IN_URL } from './authNavigation'

describe('auth navigations', () => {
  it('point at the paths the contract declares', () => {
    expect(AUTH_SIGN_IN_URL).toBe(`${LIGRETTO_CORE_URL}/api/auth/sign-in`)
    expect(AUTH_LOGOUT_URL).toBe(`${LIGRETTO_CORE_URL}/api/auth/logout`)
  })
})
