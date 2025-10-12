import { configureStore } from '@reduxjs/toolkit'

import { IS_DEV_MODE } from '#shared/constants/config'

import { routerMiddleware, createReduxHistory } from './reduxHistoryContext'
import { rootReducer } from './rootReducer'
import { listenerMiddleware } from './listenerMiddleware'

export const store = configureStore({
  reducer: rootReducer,
  devTools: IS_DEV_MODE,
  middleware: getDefaultMiddleware =>
    getDefaultMiddleware({ serializableCheck: false, thunk: false }).concat([routerMiddleware]).prepend(listenerMiddleware.middleware),
})

export const history = createReduxHistory(store)
