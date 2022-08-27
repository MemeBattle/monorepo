import { configureStore, getDefaultMiddleware } from '@reduxjs/toolkit'
import { routerMiddleware } from 'connected-react-router'
import { createBrowserHistory } from 'history'
import createSagaMiddleware from 'redux-saga'

import { IS_DEV_MODE } from 'config'

import createRootReducer from './rootReducer'
import rootSaga from './rootSaga'

const sagaMiddleware = createSagaMiddleware()

export const history = createBrowserHistory()

const middleware = [...getDefaultMiddleware({ serializableCheck: false, thunk: false }), routerMiddleware(history), sagaMiddleware]

export const store = configureStore({ reducer: createRootReducer(history), devTools: IS_DEV_MODE, middleware })

sagaMiddleware.run(rootSaga)
