import { createListenerMiddleware } from '@reduxjs/toolkit'

import { addListeners as roomsAddListener } from '#ducks/rooms'
import { addListeners as gameAddListener } from '#ducks/game'
import { addListeners as usersAddListener } from '#ducks/users'
import type { All } from '#types/store'

export const listenerMiddleware = createListenerMiddleware()

const startAppListening = listenerMiddleware.startListening.withTypes<All>()

roomsAddListener(startAppListening)
gameAddListener(startAppListening)
usersAddListener(startAppListening)
