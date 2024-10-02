import { combineReducers } from '@reduxjs/toolkit'

import { routerReducer } from './reduxHistoryContext'
import { authReducer } from '#ducks/auth'
import { usersReducer } from '#ducks/users'
import { roomsReducer } from '#ducks/rooms'
import { gameReducer } from '#ducks/game'
import { onboardingReducer } from '#features/onboarding/model/slice.js'

export const rootReducer = combineReducers({
  router: routerReducer,
  auth: authReducer,
  users: usersReducer,
  rooms: roomsReducer,
  game: gameReducer,
  onboarding: onboardingReducer,
})
