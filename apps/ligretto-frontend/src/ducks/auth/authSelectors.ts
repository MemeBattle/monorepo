import type { All } from 'types/store'

import { selectUserById } from '../users'

export const selectCurrentUserId = (state: All) => state.auth.userId

export const selectCurrentUser = (state: All) => {
  const userId = selectCurrentUserId(state)

  return userId ? selectUserById(state, userId) : null
}
