import { configureStore } from '@reduxjs/toolkit'
import type { ConfigureStoreOptions } from '@reduxjs/toolkit'

import { rootReducer } from '#app/store/rootReducer'
import { routerMiddleware } from '#app/store/reduxHistoryContext'
import type { All } from '#types/store'

export const createMockStore = (options: { preloadedState?: Partial<ConfigureStoreOptions<All>['preloadedState']> } = {}) =>
  configureStore({
    reducer: rootReducer,
    middleware: getDefaultMiddleware => getDefaultMiddleware({ serializableCheck: false, thunk: false }).concat(routerMiddleware),
    devTools: true,
    preloadedState: options.preloadedState,
  })
