import { request } from '../utils/request'
import type { UserModel } from './apiTypes'

export interface GetMeResponse {
  user: UserModel
  token: string
}

export const getMe = (token?: string) => request.post<GetMeResponse>('/auth/me', { token })
