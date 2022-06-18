import { App } from './App'
import { CasServicesContext } from './modules/cas-services'
import type { AppContextValue } from './modules/app'
import { AppContext } from './modules/app'
import type { FC, ReactNode } from 'react'
import React, { useMemo } from 'react'
import { createFrontServices } from '@memebattle/cas-services/dist/createFrontServices'

export { ROUTES } from './constants/routes'

export interface AuthFrontModuleProps {
  onLoginSucceeded: ({ token }: { token: string }) => void
  partnerId: string
  staticFilesUrl: string
  headerComponent?: ReactNode
}

export const AuthFrontModule: FC<AuthFrontModuleProps> = ({ partnerId, onLoginSucceeded, staticFilesUrl, headerComponent }) => {
  const casServices = useMemo(
    () => ({
      ...createFrontServices({ partnerId, casURI: process.env.REACT_APP_CAS_URL || 'https://cas.mems.fun/api' }),
      getAbsoluteUrl: (relativePath: string) => `${staticFilesUrl}${relativePath}`,
    }),
    [partnerId, staticFilesUrl],
  )
  const appContextValue = useMemo<AppContextValue>(() => ({ Header: headerComponent }), [headerComponent])

  return (
    <AppContext.Provider value={appContextValue}>
      <CasServicesContext.Provider value={casServices}>
        <App onLoginSucceeded={onLoginSucceeded} />
      </CasServicesContext.Provider>
    </AppContext.Provider>
  )
}
