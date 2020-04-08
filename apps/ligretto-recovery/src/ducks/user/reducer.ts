import { UserAction, UserTypeNames } from './types'
import defaultAvatar from 'assets/icons/avatars/1.svg'
import { UserProfile } from '../../types/entities/user'

export interface UserState {
  profile: UserProfile
}

const initialState: UserState = {
  profile: {
    id: 0,
    username: 'Guest',
    avatar: defaultAvatar,
  },
}

export default (state = initialState, action: UserAction): UserState => {
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
