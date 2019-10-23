import { applyMiddleware, createStore } from 'redux'
import { routerMiddleware } from 'connected-react-router'
import { createBrowserHistory } from 'history'
import { composeWithDevTools } from 'redux-devtools-extension'
import createSagaMiddleware from 'redux-saga'

import createRootReducer from './root-reducer'
import rootSaga from './root-saga'

const sagaMiddleware = createSagaMiddleware()

export const history = createBrowserHistory()

const middlewares = [routerMiddleware(history), sagaMiddleware]

export const store = createStore(createRootReducer(history), {}, composeWithDevTools(applyMiddleware(...middlewares)))

sagaMiddleware.run(rootSaga)
