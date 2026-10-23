import type { MeResponse } from '@memebattle/ligretto-auth/contract'

import { request } from '#shared/api/request'

import type { UserModel } from './apiTypes'

export { RequestError } from './request'

export const getMe = () => request.get<MeResponse>('/auth/me')

export type GetUsersResponse = Array<UserModel>

export const getUsersByIds = (ids: string[]) => request.get<GetUsersResponse>('/users', { params: { ids } })
