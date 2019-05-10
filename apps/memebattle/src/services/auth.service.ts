import request, { IRequestPromise } from 'utils/request'

export interface ILoginRequest {
  login: string
  password: string
}

export interface IRegisterRequest {
  login: string
  email: string
  password: string
}

export interface ILoginResponse {
  token: string
  user: object
}

export interface IRegisterResponse {
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
