import { combineReducers } from 'redux'
import { connectRouter } from 'connected-react-router'
import { History } from 'history'
import { All } from 'types/store'
import { cardsReducer } from 'ducks/cards'
import { roomsReducer } from 'ducks/rooms'
import { gameReducer } from 'ducks/game'
import { techReducer } from 'ducks/tech'

export default (history: History) =>
  combineReducers<All>({
    router: connectRouter(history),
    cards: cardsReducer,
    rooms: roomsReducer,
    game: gameReducer,
    tech: techReducer,
  })
