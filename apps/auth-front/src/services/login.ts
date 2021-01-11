import { request } from '../utils/request'

interface LoginCredentials {
  username: string
  password: string
}

export const login = ({ username, password }: LoginCredentials) => request.post('/login', { username, password })
