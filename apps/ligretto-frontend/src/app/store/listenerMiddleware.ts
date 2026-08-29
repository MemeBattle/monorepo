import { createListenerMiddleware } from '@reduxjs/toolkit'

import { addListeners as roomsAddListener } from '#ducks/rooms'
import { addListeners as gameAddListener } from '#ducks/game'
import { addListeners as usersAddListener } from '#ducks/users'
import { addListeners as authAddListener, getMeSuccess } from '#ducks/auth'
import { addListeners as socketAddListener } from '#entities/socket'
import { addListeners as onboardingAddListener } from '#features/onboarding'

import type { All } from '#types/store'

export const listenerMiddleware = createListenerMiddleware()

const startAppListening = listenerMiddleware.startListening.withTypes<All>()

roomsAddListener(startAppListening)
gameAddListener(startAppListening)
usersAddListener(startAppListening)
authAddListener(startAppListening)
onboardingAddListener(startAppListening)

let socketStarted = false
startAppListening({
  actionCreator: getMeSuccess,
  effect: (action, listenerApi) => {
    // A plain flag instead of unsubscribe(): RTK snapshots the listener map
    // per dispatch, so unsubscribe alone does not stop re-entrant dispatches
    // that are already in flight.
    if (socketStarted) {
      return
    }
    socketStarted = true
    socketAddListener(startAppListening, listenerApi.dispatch, action.payload.token)
  },
})
