import { AxiosInstance } from 'axios'
import { CAS_ROUTES } from '../constants'
import { SuccessGetUsers, GetUsersPayload, ErrorGetUsers } from '../types'

export const createGetUsersService = (request: AxiosInstance) => (params?: GetUsersPayload) => {
  return request.get<SuccessGetUsers | ErrorGetUsers, SuccessGetUsers | ErrorGetUsers>(
    `${CAS_ROUTES.users}`,
    {
      params,
    },
  )
}
