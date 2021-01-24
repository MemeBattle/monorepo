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

interface FailedAnswer {
  success: false
  error: {
    errorCode: number
    errorMessage: string
  }
}

export const login = (credentials: LoginCredentials) => request.post<SuccessAnswer | FailedAnswer>('/auth/login', credentials)
