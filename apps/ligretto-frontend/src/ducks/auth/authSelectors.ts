import type { All } from 'types/store'

import { userByIdSelector } from '../users'

export const currentUserIdSelector = (state: All) => state.auth.userId

export const isUserLoadingSelector = (state: All) => state.auth.isLoading

export const currentUserSelector = (state: All) => {
  const userId = currentUserIdSelector(state)

  return userId ? userByIdSelector(state, userId) : null
}

export const tokenSelector = (state: All) => state.auth.token
