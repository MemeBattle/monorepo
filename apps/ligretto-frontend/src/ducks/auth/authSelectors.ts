import type { All } from '#types/store'

import { userByIdSelector } from '../users'

export const currentUserIdSelector = (state: All) => state.auth.userId

/** No `me` has answered yet; a refresh never sets it back, so the routes stay mounted. */
export const isIdentityPendingSelector = (state: All) => !state.auth.isBootstrapped

export const currentUserSelector = (state: All) => {
  const userId = currentUserIdSelector(state)

  return userId ? userByIdSelector(state, userId) : null
}

export const accessTokenSelector = (state: All) => state.auth.accessToken
