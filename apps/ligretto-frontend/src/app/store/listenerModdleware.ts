import { createListenerMiddleware } from '@reduxjs/toolkit'

import { addListeners as roomsAddListener } from '#ducks/rooms'
import { addListeners as onboardingAddListener } from '#features/onboarding'
import type { All } from '#types/store'

export const listenerMiddleware = createListenerMiddleware()

const startAppListening = listenerMiddleware.startListening.withTypes<All>()

roomsAddListener(startAppListening)
onboardingAddListener(startAppListening)
