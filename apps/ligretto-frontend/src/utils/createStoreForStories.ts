import { configureStore, getDefaultMiddleware } from '@reduxjs/toolkit'
import type { ConfigureStoreOptions } from '@reduxjs/toolkit'

import { rootReducer } from '../store/rootReducer'
import { routerMiddleware } from '../store/reduxHistoryContext'
import type { All } from 'types/store'

const middleware = [...getDefaultMiddleware({ serializableCheck: false, thunk: false }), routerMiddleware]

export const createStoreForStories = (options: { preloadedState?: ConfigureStoreOptions<All>['preloadedState'] } = {}) =>
  configureStore({ reducer: rootReducer, middleware, devTools: true, preloadedState: options.preloadedState })
