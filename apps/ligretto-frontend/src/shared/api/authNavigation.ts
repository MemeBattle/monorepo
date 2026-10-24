import { CAS_URL, LIGRETTO_CORE_URL } from '#shared/constants/config'

export const AUTH_SIGN_IN_URL = `${LIGRETTO_CORE_URL}/auth/sign-in`
export const AUTH_LOGOUT_URL = `${LIGRETTO_CORE_URL}/auth/logout`

export const navigateToSignIn = () => window.location.assign(AUTH_SIGN_IN_URL)

export const navigateToLogout = () => window.location.assign(AUTH_LOGOUT_URL)

// The profile lives in the CAS dashboard, served at the root of CAS.
export const navigateToProfile = () => window.location.assign(CAS_URL)

export const restartOnHome = () => window.location.assign('/')
