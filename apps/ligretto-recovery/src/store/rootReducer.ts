import { combineReducers } from 'redux'
import { connectRouter } from 'connected-react-router'
import type { History } from 'history'
import type { All } from 'types/store'
import { roomsReducer } from 'ducks/rooms'
import { gameReducer } from 'ducks/game'
import { techReducer } from 'ducks/tech'

export default (history: History) =>
  combineReducers<All>({
    router: connectRouter(history),
    rooms: roomsReducer,
    game: gameReducer,
    tech: techReducer,
  })
