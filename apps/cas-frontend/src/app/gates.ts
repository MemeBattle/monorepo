import { redirect } from 'react-router'

import { getMe } from '#entities/session'
import type { Me } from '#entities/session'
import { isApiError } from '#shared/api/request'
import { routes } from './routes'

/**
 * `/api/me` as a fact about the browser: the account, or `null` when it holds
 * no live session. Any other failure is still thrown and lands on the error
 * screen.
 */
const currentAccount = async (): Promise<Me | null> => {
  try {
    return await getMe()
  } catch (error) {
    if (isApiError(error) && error.code === 'unauthenticated') {
      return null
    }
    throw error
  }
}

/** The dashboard's loader: the signed-in account, or the way to sign in. */
export const requireSession = async (): Promise<Me> => {
  const me = await currentAccount()
  if (!me) {
    throw redirect(routes.SIGN_IN)
  }
  return me
}

/** The loader of sign-in and create account: a browser that is already signed in has nothing to do there. */
export const requireNoSession = async (): Promise<null> => {
  if (await currentAccount()) {
    throw redirect(routes.DASHBOARD)
  }
  return null
}
