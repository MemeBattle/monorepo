import request, { RequestPromise } from 'utils/request'

export interface LoginRequest {
  login: string
  password: string
}

export interface RegisterRequest {
  login: string
  email: string
  password: string
}

export interface LoginResponse {
  token: string
  user: object
}

export interface RegisterResponse {
  token: string
  user: object
}

export default {
  login({ login, password }: ILoginRequest): IRequestPromise<ILoginResponse> {
    return request.post('/login', { login, password })
  },

  register({ login, email, password }: IRegisterRequest): IRequestPromise<IRegisterResponse> {
    return request.post('/register', { login, email, password })
  },
}
