import { configureStore, getDefaultMiddleware } from '@reduxjs/toolkit'
import { routerMiddleware } from 'connected-react-router'
import { createBrowserHistory } from 'history'
import createSagaMiddleware from 'redux-saga'

import createRootReducer from './rootReducer'
import rootSaga from './rootSaga'

const sagaMiddleware = createSagaMiddleware()

export const history = createBrowserHistory()

const middleware = [...getDefaultMiddleware({ serializableCheck: false, thunk: false }), routerMiddleware(history), sagaMiddleware]

export const store = configureStore({ reducer: createRootReducer(history), devTools: process.env.NODE_ENV === 'development', middleware })

if (process.env.NODE_ENV === 'development' && module.hot) {
  module.hot.accept('./rootReducer', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const newRootReducer = require('./rootReducer').default

    store.replaceReducer(newRootReducer)
  })
}

sagaMiddleware.run(rootSaga)
