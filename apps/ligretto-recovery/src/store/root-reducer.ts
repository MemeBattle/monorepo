import { combineReducers } from 'redux'
import { connectRouter } from 'connected-react-router'
import { History } from 'history'
import { All } from 'types/store'
import { userReducer } from 'ducks/user'
import { cardsReducer } from 'ducks/cards'
import { roomsReducer } from 'ducks/rooms'
import { gameReducer } from 'ducks/game'

export default (history: History) =>
  combineReducers<All>({
    router: connectRouter(history),
    user: userReducer,
    cards: cardsReducer,
    rooms: roomsReducer,
    game: gameReducer,
  })
