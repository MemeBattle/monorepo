import { AxiosInstance } from 'axios'
import { CAS_ROUTES } from '../constants'
import { ErrorGetMe, SuccessGetMe, GetMePayload } from '../types'

export const createGetMeService = (request: AxiosInstance) => ({ token }: GetMePayload) => {
  return request.get<SuccessGetMe | ErrorGetMe, SuccessGetMe | ErrorGetMe>(`${CAS_ROUTES.getMe}`, {
    headers: { Authorization: token },
    params: { token },
  })
}
