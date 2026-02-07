import { createContext } from 'react'
import { createFrontServices, type FrontServices } from '@memebattle/cas-services/createFrontServices'
export type CasServicesContextValue = FrontServices & {
  getAbsoluteUrl: (relativePath: string) => string
}

const defaultValue: CasServicesContextValue = {
  ...createFrontServices({ partnerId: '', casURI: '', successLogger: window.console.log, errorLogger: window.console.error }),
  getAbsoluteUrl: (relativePath: string): string => relativePath,
}

export const CasServicesContext = createContext(defaultValue)
CasServicesContext.displayName = 'CasServicesContext'
