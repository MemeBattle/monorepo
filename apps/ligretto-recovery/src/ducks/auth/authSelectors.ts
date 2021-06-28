import type { All } from '../../types/store'
import { selectUserById } from '../users'

const selectMyUserId = (state: All) => state.auth.userId

export const selectMyUser = (state: All) => {
  const userId = selectMyUserId(state)

  return userId ? selectUserById(state, userId) : null
}
