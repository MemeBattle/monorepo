import { CAS_ROUTES } from '../constants'
import type { AxiosInstance } from 'axios'
import type { SignUpCredentials, SuccessSignUp, ErrorSignUp } from '../types'

export const createSignUpService = (request: AxiosInstance, partnerId: string) => (payload: SignUpCredentials) =>
  request.post<SuccessSignUp | ErrorSignUp, SuccessSignUp | ErrorSignUp>(CAS_ROUTES.emailSignUp, {
    ...payload,
    partnerId,
  })
