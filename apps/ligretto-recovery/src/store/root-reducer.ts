import { combineReducers } from 'redux'
import { connectRouter } from 'connected-react-router'
import { History } from 'history'
import { userReducer } from 'ducks/user'
import { cardsReducer } from 'ducks/cards'

export default (history: History) =>
  combineReducers({
    router: connectRouter(history),
    user: userReducer,
    cards: cardsReducer,
  })
