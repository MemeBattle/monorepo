import type { All } from '#types/store'

import { usersEntityAdapter } from './usersSlice'
import type { User } from './usersTypes'

const usersEntitiesSelectors = usersEntityAdapter.getSelectors()

export const userByIdSelector = (state: All, id: User['casId']) => usersEntitiesSelectors.selectById(state.users, id)
export const usersMapSelector = (state: All) => usersEntitiesSelectors.selectEntities(state.users)
