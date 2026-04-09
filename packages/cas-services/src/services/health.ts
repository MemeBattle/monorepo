import type { HttpClient } from '../request'
import { CAS_ROUTES } from '../constants'
import type { SuccessHealthCheck, ErrorHealthCheck } from '../types'

export const createHealthService = (request: HttpClient) => () => request.get<ErrorHealthCheck | SuccessHealthCheck>(CAS_ROUTES.health)
