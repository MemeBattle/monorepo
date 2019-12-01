import { Action, ErrorAction } from '@memebattle/redux-utils'

export enum UserTypeNames {
  GET_PROFILE_REQUEST = '@@user/GET_PROFILE_REQUEST',
  GET_PROFILE_SUCCESS = '@@user/GET_PROFILE_SUCCESS',
  GET_PROFILE_ERROR = '@@user/GET_PROFILE_ERROR',
}

export type GetProfileRequestAction = Action<UserTypeNames.GET_PROFILE_REQUEST>
export type GetProfileSuccessAction = Action<
  UserTypeNames.GET_PROFILE_SUCCESS,
  {
    user: any
  }
>
export type GetProfileErrorAction = ErrorAction<UserTypeNames.GET_PROFILE_ERROR>

export type UserAction = GetProfileRequestAction | GetProfileSuccessAction | GetProfileErrorAction
