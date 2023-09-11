import { configureStore, getDefaultMiddleware } from '@reduxjs/toolkit'
import createSagaMiddleware from 'redux-saga'

import { IS_DEV_MODE } from 'shared/constants/config'

import rootSaga from './rootSaga'
import { routerMiddleware, createReduxHistory } from './reduxHistoryContext'
import { rootReducer } from './rootReducer'

const sagaMiddleware = createSagaMiddleware()

const middleware = [...getDefaultMiddleware({ serializableCheck: false, thunk: false }), routerMiddleware, sagaMiddleware]

export const store = configureStore({ reducer: rootReducer, devTools: IS_DEV_MODE, middleware })

export const history = createReduxHistory(store)

sagaMiddleware.run(rootSaga)
