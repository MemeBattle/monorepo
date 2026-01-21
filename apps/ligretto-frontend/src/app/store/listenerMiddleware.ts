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

const unsubscribeSocket = startAppListening({
  actionCreator: getMeSuccess,
  effect: async (_action, listenerApi) => {
    socketAddListener(startAppListening, listenerApi.dispatch)
    unsubscribeSocket()
  },
})
