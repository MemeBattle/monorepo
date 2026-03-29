import type { AxiosInstance } from 'axios'
import { CAS_ROUTES } from '../constants'
import type { SuccessGetUsers, GetUsersPayload, ErrorGetUsers } from '../types'

export const createGetUsersService = (request: AxiosInstance) => (params?: GetUsersPayload) =>
  request.get<SuccessGetUsers | ErrorGetUsers, SuccessGetUsers | ErrorGetUsers>(`${CAS_ROUTES.users}`, {
    params,
  })
