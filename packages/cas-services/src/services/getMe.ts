import type { HttpClient } from '../request'
import { CAS_ROUTES } from '../constants'
import type { ErrorGetMe, SuccessGetMe, GetMePayload } from '../types'

export const createGetMeService =
  (request: HttpClient) =>
  ({ token }: GetMePayload) =>
    request.get<SuccessGetMe | ErrorGetMe>(`${CAS_ROUTES.getMe}`, {
      headers: { Authorization: token },
      params: { token },
    })
