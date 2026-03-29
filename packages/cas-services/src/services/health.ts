import type { AxiosInstance } from 'axios'
import { CAS_ROUTES } from '../constants'
import type { SuccessHealthCheck, ErrorHealthCheck } from '../types'

export const createHealthService = (request: AxiosInstance) => () =>
  request.get<ErrorHealthCheck | SuccessHealthCheck, ErrorHealthCheck | SuccessHealthCheck>(CAS_ROUTES.health)
