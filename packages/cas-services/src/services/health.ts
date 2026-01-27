import { AxiosInstance } from 'axios'
import { CAS_ROUTES } from '../constants'
import { SuccessHealthCheck, ErrorHealthCheck } from '../types'

export const createHealthService = (request: AxiosInstance) => () => {
  return request.get<ErrorHealthCheck | SuccessHealthCheck, ErrorHealthCheck | SuccessHealthCheck>(
    CAS_ROUTES.health,
  )
}
