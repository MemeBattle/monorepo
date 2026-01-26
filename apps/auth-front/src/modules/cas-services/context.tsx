import { createContext } from 'react'
import * as casServicesModule from '@memebattle/cas-services'

export const CasServicesContext = createContext({
  ...casServicesModule.createFrontServices({ partnerId: '', casURI: '', successLogger: window.console.log, errorLogger: window.console.error }),
  getAbsoluteUrl: (relativePath: string): string => relativePath,
})
CasServicesContext.displayName = 'CasServicesContext'
