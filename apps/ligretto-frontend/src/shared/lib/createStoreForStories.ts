import { configureStore, getDefaultMiddleware } from '@reduxjs/toolkit'
import type { ConfigureStoreOptions } from '@reduxjs/toolkit'

// TODO: probably need to move it somewhere from shared
import { rootReducer } from 'app/store/rootReducer'
import { routerMiddleware } from 'app/store/reduxHistoryContext'
import type { All } from 'types/store'

const middleware = [...getDefaultMiddleware({ serializableCheck: false, thunk: false }), routerMiddleware]

export const createStoreForStories = (options: { preloadedState?: ConfigureStoreOptions<All>['preloadedState'] } = {}) =>
  configureStore({ reducer: rootReducer, middleware, devTools: true, preloadedState: options.preloadedState })
