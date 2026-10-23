import * as Sentry from '@sentry/browser'
import type { TypedStartListening } from '@reduxjs/toolkit'
import type { MeResponse } from '@memebattle/ligretto-auth/contract'

import { getMeRequest, getMeSuccess, getMeFailure } from './authActions'

import { analytics } from '#entities/analytics'
import { addUser } from '#ducks/users'
import { getMe } from '#shared/api'
import { restartOnHome } from '#shared/api/authNavigation'
import type { All } from '#types/store'

/**
 * `me` runs again this long before `expiresAt`. The backend refreshes the grant only when the access token has less
 * than a minute left, so the lead stays below that minute, or the answer carries the same token. The lead also keeps
 * the old token alive until the new one arrives. `expiresAt` is on the backend's clock and the timer on the browser's.
 * A browser clock ahead by more than the margin reaches the backend outside its window and gets the same token back.
 * The timer then waits at least `RETRY_DELAY_MS`, so those refreshes run once per retry delay, not once per round trip.
 */
export const REFRESH_LEAD_MS = 30_000

/**
 * A failed `me` is tried again after this long: a failed bootstrap keeps the loader up, a failed refresh still holds a
 * working token. It is also the shortest delay the refresh timer schedules.
 */
export const RETRY_DELAY_MS = 5_000

export function addListeners(startListener: TypedStartListening<All>) {
  startListener({
    actionCreator: getMeRequest,
    effect: async (_action, listenerApi) => {
      // RTK allows getOriginalState() only synchronously: after the first `await` it throws. The effect reads these
      // three values once, here.
      const { isLoading, isBootstrapped: wasBootstrapped, userId: previousUserId } = listenerApi.getOriginalState().auth

      // The reducer sets isLoading synchronously, so a value of `true` *before* this action means another identity
      // request is already in flight — a duplicate would mint a second guest session, and the last Set-Cookie would win.
      if (isLoading) {
        return
      }

      let data: MeResponse
      try {
        data = (await getMe()).data
      } catch (e) {
        console.error(e)
        listenerApi.dispatch(getMeFailure())
        return
      }

      const { user, accessToken, expiresAt } = data

      // The page runs as one identity: the gameplay socket was bound to it at the handshake and the game selectors key
      // on it. A `me` naming another `sub` — a guest minted after this session's grant ended, or the account another
      // tab signed in or out — cannot be applied in place, so nothing is dispatched and the page restarts on `/`,
      // where the bootstrap runs as the new identity. isLoading stays `true`, so no further `me` runs while this page
      // goes away; the socket and the timers die with it. The decision is on `sub` alone, never on `signedOut`: a
      // guest replaced by a guest, or a sign-in in another tab, both arrive with `signedOut: false`.
      if (wasBootstrapped && user.sub !== previousUserId) {
        restartOnHome()
        return
      }

      listenerApi.dispatch(addUser({ casId: user.sub, accountType: user.accountType, displayName: user.name, avatarUrl: user.avatarUrl }))

      Sentry.setUser({ id: user.sub, username: user.name ?? undefined })

      // The property keeps its name so the analytics dashboards keep their segment.
      analytics.setUserProperties({ id: user.sub, isTemporary: user.accountType === 'guest' })
      // A refresh is not an authorization.
      if (!wasBootstrapped) {
        analytics.logEvent('User authorized')
      }

      listenerApi.dispatch(getMeSuccess({ userId: user.sub, accessToken, expiresAt, accountType: user.accountType }))
    },
  })

  // The refresh timer. A newer answer cancels the pending delay (it rejects, and RTK swallows the rejection).
  startListener({
    actionCreator: getMeSuccess,
    effect: async ({ payload }, listenerApi) => {
      listenerApi.cancelActiveListeners()
      await listenerApi.delay(Math.max(RETRY_DELAY_MS, payload.expiresAt - Date.now() - REFRESH_LEAD_MS))
      listenerApi.dispatch(getMeRequest())
    },
  })

  startListener({
    actionCreator: getMeFailure,
    effect: async (_action, listenerApi) => {
      listenerApi.cancelActiveListeners()
      await listenerApi.delay(RETRY_DELAY_MS)
      listenerApi.dispatch(getMeRequest())
    },
  })
}
