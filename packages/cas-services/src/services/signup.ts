import { CAS_ROUTES } from '../constants'
import type { HttpClient } from '../request'
import type { SignUpCredentials, SuccessSignUp, ErrorSignUp } from '../types'

export const createSignUpService = (request: HttpClient, partnerId: string) => (payload: SignUpCredentials) =>
  request.post<SuccessSignUp | ErrorSignUp>(CAS_ROUTES.emailSignUp, {
    ...payload,
    partnerId,
  })
