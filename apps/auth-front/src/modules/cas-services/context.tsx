import { createContext } from 'react'
import { createFrontServices } from '@memebattle/cas-services'

export const CasServicesContext = createContext(
  createFrontServices({ partnerId: '', casURI: '', successLogger: window.console.log, errorLogger: window.console.error }),
)
CasServicesContext.displayName = 'CasServicesContext'
