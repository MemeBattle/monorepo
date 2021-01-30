import { request } from '../utils/request'

interface LoginCredentials {
  login: string
  password: string
}

interface SuccessAnswer {
  token: string
  user: {
    activated: boolean
    username: string
    _id: string
    email: string
  }
  profile: {
    id: number
  }
}

export interface FailedAnswer {
  errorCode: number
  errorMessage: string
}

export const login = (credentials: LoginCredentials) => request.post<SuccessAnswer>('/auth/login', credentials)
