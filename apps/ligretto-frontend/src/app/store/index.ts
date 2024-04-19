import { configureStore } from '@reduxjs/toolkit'
import createSagaMiddleware from 'redux-saga'

import { IS_DEV_MODE } from '#shared/constants/config'

import rootSaga from './rootSaga'
import { routerMiddleware, createReduxHistory } from './reduxHistoryContext'
import { rootReducer } from './rootReducer'

const sagaMiddleware = createSagaMiddleware()

export const store = configureStore({
  reducer: rootReducer,
  devTools: IS_DEV_MODE,
  middleware: getDefaultMiddleware => getDefaultMiddleware({ serializableCheck: false, thunk: false }).concat([routerMiddleware, sagaMiddleware]),
})

export const history = createReduxHistory(store)

sagaMiddleware.run(rootSaga)
