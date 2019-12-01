import { createAction } from '@memebattle/redux-utils'
import { GetProfileErrorAction, GetProfileRequestAction, GetProfileSuccessAction, UserTypeNames } from './types'

export const getProfileRequest = createAction<GetProfileRequestAction>(UserTypeNames.GET_PROFILE_REQUEST)
export const getProfileSuccess = createAction<GetProfileSuccessAction>(UserTypeNames.GET_PROFILE_SUCCESS)
export const getProfileError = createAction<GetProfileErrorAction>(UserTypeNames.GET_PROFILE_ERROR)
