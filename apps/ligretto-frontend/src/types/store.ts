import type { store } from '#app/store'

export type All = ReturnType<typeof store.getState>
