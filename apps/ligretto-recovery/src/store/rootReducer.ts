import { combineReducers } from 'redux'
import { connectRouter } from 'connected-react-router'
import type { History } from 'history'
import { authReducer } from 'ducks/auth'
import { usersReducer } from 'ducks/users'
import { roomsReducer } from 'ducks/rooms'
import { gameReducer } from 'ducks/game'
import { techReducer } from 'ducks/tech'

// eslint-disable-next-line import/no-anonymous-default-export
export default (history: History) =>
  combineReducers({
    router: connectRouter(history),
    auth: authReducer,
    users: usersReducer,
    rooms: roomsReducer,
    game: gameReducer,
    tech: techReducer,
  })
