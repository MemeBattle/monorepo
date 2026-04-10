import type { HttpClient } from '../request'
import { CAS_ROUTES } from '../constants'
import type { SuccessCreateTemporaryToken, ErrorCreateTemporaryToken } from '../types'

export const createCreateTemporaryTokenService = (request: HttpClient) => () =>
  request.post<SuccessCreateTemporaryToken | ErrorCreateTemporaryToken>(`${CAS_ROUTES.temporaryToken}`)
