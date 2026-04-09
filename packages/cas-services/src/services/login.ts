import type { HttpClient } from '../request'
import { CAS_ROUTES } from '../constants'
import type { LoginCredentials, SuccessLogin, ErrorLogin } from '../types'

export const createLoginService = (request: HttpClient) => (credentials: LoginCredentials) =>
  request.post<ErrorLogin | SuccessLogin>(CAS_ROUTES.loginRequest, credentials)
