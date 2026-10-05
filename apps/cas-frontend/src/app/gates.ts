import { redirect } from 'react-router'
import type { LoaderFunctionArgs } from 'react-router'

import { getMe } from '#entities/session'
import type { Me } from '#entities/session'
import { unwrap } from '#shared/api/client'
import { leaveTo, readReturnTo } from './returnTo'
import { routes } from './routes'

/**
 * `/api/me` as a fact about the browser: the account, or `null` when it holds
 * no live session. Any other failure is still thrown and lands on the error
 * screen.
 */
const currentAccount = async (): Promise<Me | null> => {
  const result = await getMe()
  if (!result.ok && result.error.code === 'unauthenticated') {
    return null
  }
  return unwrap(result)
}

/**
 * The dashboard's loader: the signed-in account, or the way to sign in. A guest passes too; the dashboard decides what
 * to show it (docs/adr/0003-guest-in-the-app.md).
 */
export const requireSession = async (): Promise<Me> => {
  const me = await currentAccount()
  if (!me) {
    throw redirect(routes.SIGN_IN)
  }
  return me
}

/**
 * The loader of sign-in and create account: a browser that is already signed
 * in to a full account has nothing to do there. With an accepted `return_to`
 * it is forwarded there at once (the request it came with completes on its
 * session), otherwise it goes to the dashboard. Forwarding never settles, so
 * the session check stays on screen until the browser has left.
 *
 * Resolves with `null` without a session, and with the guest's `Me` for a
 * guest, whatever `return_to` says: these two screens are a guest's only way
 * to an account, and CAS answers its upgrade session at `return_to` with
 * create-account again (docs/adr/0003-guest-in-the-app.md).
 */
export const requireNoSession = async ({ request }: Pick<LoaderFunctionArgs, 'request'>): Promise<Me | null> => {
  const me = await currentAccount()
  if (!me) {
    return null
  }
  if (me.accountType === 'guest') {
    return me
  }
  const returnTo = readReturnTo(new URL(request.url).search)
  if (!returnTo) {
    throw redirect(routes.DASHBOARD)
  }
  // Leaving is a document navigation, outside the router's cancellation: a navigation abandoned while `/api/me`
  // was in flight must not take the page away. The router ignores an aborted loader's rejection.
  request.signal.throwIfAborted()
  return leaveTo(returnTo)
}
