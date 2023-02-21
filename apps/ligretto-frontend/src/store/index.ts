import { configureStore, getDefaultMiddleware } from '@reduxjs/toolkit'
import { createReduxHistoryContext } from 'redux-first-history'
import { createBrowserHistory } from 'history'
import createSagaMiddleware from 'redux-saga'
import { combineReducers } from '@reduxjs/toolkit'

import { authReducer } from 'ducks/auth'
import { usersReducer } from 'ducks/users'
import { roomsReducer } from 'ducks/rooms'
import { gameReducer } from 'ducks/game'
import { techReducer } from 'ducks/tech'

import { IS_DEV_MODE } from 'config'

import rootSaga from './rootSaga'

const { createReduxHistory, routerMiddleware, routerReducer } = createReduxHistoryContext({ history: createBrowserHistory() })

const rootReducer = combineReducers({
  router: routerReducer,
  auth: authReducer,
  users: usersReducer,
  rooms: roomsReducer,
  game: gameReducer,
  tech: techReducer,
})

const sagaMiddleware = createSagaMiddleware()

const middleware = [...getDefaultMiddleware({ serializableCheck: false, thunk: false }), routerMiddleware, sagaMiddleware]

export const store = configureStore({ reducer: rootReducer, devTools: IS_DEV_MODE, middleware })

export const history = createReduxHistory(store)

sagaMiddleware.run(rootSaga)
