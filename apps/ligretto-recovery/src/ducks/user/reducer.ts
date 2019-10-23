import { UserAction, UserTypeNames } from './types'
import * as Store from 'types/store'
import defaultAvatar from 'assets/icons/avatars/1.svg'

const initialState: Store.User = {
  profile: {
    id: 0,
    username: 'Guest',
    avatar: defaultAvatar,
  },
}

export default (state = initialState, action: UserAction): Store.User => {
  switch (action.type) {
    case UserTypeNames.GET_PROFILE_REQUEST:
      return state

    case UserTypeNames.GET_PROFILE_SUCCESS:
      return {
        ...state,
        profile: action.payload.user,
      }

    case UserTypeNames.GET_PROFILE_ERROR:
      return state

    default:
      return state
  }
}
