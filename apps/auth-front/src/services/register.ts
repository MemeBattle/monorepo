import { request } from '../utils/request'

interface RegisterCredentials {
  username: string
  email: string
  password: string
}

interface SuccessSignup {
  user: {
    activated: boolean
    username: string
    _id: string
    email: string
    partnerId: string
  }
}

export const register = ({ username, email, password }: RegisterCredentials) =>
  request.post<SuccessSignup>('/register', { username, email, password })
