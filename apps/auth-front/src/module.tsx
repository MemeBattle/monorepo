import { App } from './App'
import { CasServicesContext } from './modules/cas-services'
import type { AppContextValue } from './modules/app'
import { AppContext } from './modules/app'
import type { FC, ReactNode } from 'react'
import React, { useMemo } from 'react'
import * as casServicesModule from '@memebattle/cas-services'

export { ROUTES } from './constants/routes'

export interface AuthFrontModuleProps {
  onLoginSucceeded: ({ token }: { token: string }) => void
  partnerId: string
  staticFilesUrl: string
  headerComponent?: ReactNode
  token: string
  casURL: string
}

export const AuthFrontModule: FC<AuthFrontModuleProps> = ({ partnerId, onLoginSucceeded, staticFilesUrl, headerComponent, token, casURL }) => {
  const casServices = useMemo(
    () => ({
      ...casServicesModule.createFrontServices({ partnerId, casURI: casURL }),
      getAbsoluteUrl: (relativePath: string) => `${staticFilesUrl}${relativePath}`,
    }),
    [casURL, partnerId, staticFilesUrl],
  )
  const appContextValue = useMemo<AppContextValue>(() => ({ Header: headerComponent, token }), [headerComponent, token])

  return (
    <AppContext.Provider value={appContextValue}>
      <CasServicesContext.Provider value={casServices}>
        <App onLoginSucceeded={onLoginSucceeded} />
      </CasServicesContext.Provider>
    </AppContext.Provider>
  )
}
