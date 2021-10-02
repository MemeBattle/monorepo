import { usersEntityAdapter } from './usersSlice'
import type { All } from '../../types/store'
import type { User } from './usersTypes'

const usersEntitiesSelectors = usersEntityAdapter.getSelectors()

export const selectUserById = (state: All, id: User['casId']) => usersEntitiesSelectors.selectById(state.users, id)
export const selectUsersMap = (state: All) => usersEntitiesSelectors.selectEntities(state.users)
