import { request } from '../utils/request'

interface RegisterCredentials {
  username: string
  email: string
  password: string
}

export const register = ({ username, email, password }: RegisterCredentials) => request.post('/register', { username, email, password })
