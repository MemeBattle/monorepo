import type { All } from '#types/store'

import { userByIdSelector } from '../users'

export const currentUserIdSelector = (state: All) => state.auth.userId

export const isIdentityPendingSelector = (state: All) => !state.auth.isBootstrapped

export const currentUserSelector = (state: All) => {
  const userId = currentUserIdSelector(state)

  return userId ? userByIdSelector(state, userId) : null
}
