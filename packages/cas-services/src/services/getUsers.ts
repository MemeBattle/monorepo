import type { HttpClient } from '../request'
import { CAS_ROUTES } from '../constants'
import type { SuccessGetUsers, GetUsersPayload, ErrorGetUsers } from '../types'

export const createGetUsersService = (request: HttpClient) => (params?: GetUsersPayload) =>
  request.get<SuccessGetUsers | ErrorGetUsers>(`${CAS_ROUTES.users}`, { params })
