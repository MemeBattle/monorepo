import { AxiosInstance } from 'axios'
import { CAS_ROUTES } from '../constants'
import { SuccessCreateTemporaryToken, ErrorCreateTemporaryToken } from '../types'

export const createCreateTemporaryTokenService = (request: AxiosInstance) => () => {
  return request.post<
    SuccessCreateTemporaryToken | ErrorCreateTemporaryToken,
    SuccessCreateTemporaryToken | ErrorCreateTemporaryToken
  >(`${CAS_ROUTES.temporaryToken}`)
}
