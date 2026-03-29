import type { AxiosInstance } from 'axios'
import { CAS_ROUTES } from '../constants'
import type { LoginCredentials, SuccessLogin, ErrorLogin } from '../types'

export const createLoginService = (request: AxiosInstance) => (credentials: LoginCredentials) =>
  request.post<ErrorLogin | SuccessLogin, ErrorLogin | SuccessLogin>(CAS_ROUTES.loginRequest, credentials)
