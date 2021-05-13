import { request } from '../utils/request'

interface GetMeSuccess {
  user: {
    _id: string
    username: string
    avatar?: string
  }
}

export const getMe = (token: string) => request.post<GetMeSuccess>('/auth/me', { token })
