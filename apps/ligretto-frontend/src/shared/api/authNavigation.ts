import { LIGRETTO_CORE_URL } from '#shared/constants/config'

// Top-level navigations, not fetches: the core backend answers `sign-in` and `logout` with a redirect, and the
// cookie that ties the sign-in to its callback is only set on the browser's own navigation.
export const AUTH_SIGN_IN_URL = `${LIGRETTO_CORE_URL}/auth/sign-in`
export const AUTH_LOGOUT_URL = `${LIGRETTO_CORE_URL}/auth/logout`

/** Signs in, and upgrades a guest: the backend tells CAS which of the two it is. */
export const navigateToSignIn = () => window.location.assign(AUTH_SIGN_IN_URL)

export const navigateToLogout = () => window.location.assign(AUTH_LOGOUT_URL)

/**
 * Leaves the running page for a fresh one on `/`, where the bootstrap runs again: the same landing as the sign-in
 * callback, so every identity change ends with a clean page.
 */
export const restartOnHome = () => window.location.assign('/')
