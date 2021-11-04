import type { History } from 'history'
import { connectRouter } from 'connected-react-router'
import { combineReducers } from 'redux'

import { authReducer } from 'ducks/auth'
import { usersReducer } from 'ducks/users'
import { roomsReducer } from 'ducks/rooms'
import { gameReducer } from 'ducks/game'
import { techReducer } from 'ducks/tech'

const rootReducer = (history: History) =>
  combineReducers({
    router: connectRouter(history),
    auth: authReducer,
    users: usersReducer,
    rooms: roomsReducer,
    game: gameReducer,
    tech: techReducer,
  })

export default rootReducer
