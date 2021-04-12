import { CasServicesContext } from './context'
import { useContext } from 'react'

/**
 * Return prepared services to work with CAS
 */
export const useCasServices = () => {
  const services = useContext(CasServicesContext)

  return services
}
