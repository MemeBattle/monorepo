import type { All } from 'types/store'

export const locationSelector = (state: All) => state.router.location
