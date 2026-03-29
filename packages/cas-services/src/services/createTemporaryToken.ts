import type { AxiosInstance } from 'axios'
import { CAS_ROUTES } from '../constants'
import type { SuccessCreateTemporaryToken, ErrorCreateTemporaryToken } from '../types'

export const createCreateTemporaryTokenService = (request: AxiosInstance) => () =>
  request.post<SuccessCreateTemporaryToken | ErrorCreateTemporaryToken, SuccessCreateTemporaryToken | ErrorCreateTemporaryToken>(
    `${CAS_ROUTES.temporaryToken}`,
  )
