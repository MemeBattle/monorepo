import { AxiosInstance } from 'axios'
import { CAS_ROUTES } from '../constants'
import { LoginCredentials, SuccessLogin, ErrorLogin } from '../types'

export const createLoginService = (request: AxiosInstance) => (credentials: LoginCredentials) => {
  return request.post<ErrorLogin | SuccessLogin, ErrorLogin | SuccessLogin>(
    CAS_ROUTES.loginRequest,
    credentials,
  )
}
