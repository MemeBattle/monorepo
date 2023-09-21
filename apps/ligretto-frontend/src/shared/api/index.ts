import { request } from 'shared/api/request'

import type { UserModel } from './apiTypes'

export interface GetMeResponse {
  user: UserModel
  token: string
}

export const getMe = (token?: string) => request.post<GetMeResponse>('/auth/me', { token })

export type GetUsersResponse = Array<UserModel>

export const getUsersByIds = (ids: string[]) => request.get<GetUsersResponse>('/users', { params: { ids } })
