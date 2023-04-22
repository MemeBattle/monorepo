import { App } from './App'
import { CasServicesContext } from './modules/cas-services'
import type { AppContextValue } from './modules/app'
import { AppContext } from './modules/app'
import type { FC, ReactNode } from 'react'
import React, { useMemo } from 'react'
import { createFrontServices } from '@memebattle/cas-services/dist/createFrontServices'
import { ROUTES } from './constants/routes'
import type { AuthRoutes } from './types/authRoutes'

export { ROUTES } from './constants/routes'

export interface AuthFrontModuleProps {
  onLoginSucceeded: ({ token }: { token: string }) => void
  partnerId: string
  staticFilesUrl: string
  headerComponent?: ReactNode
  token: string
  casURL: string
  authRoutes?: AuthRoutes
}

export const AuthFrontModule: FC<AuthFrontModuleProps> = ({
  partnerId,
  onLoginSucceeded,
  staticFilesUrl,
  headerComponent,
  token,
  casURL,
  authRoutes = ROUTES,
}) => {
  const casServices = useMemo(
    () => ({
      ...createFrontServices({ partnerId, casURI: casURL }),
      getAbsoluteUrl: (relativePath: string) => `${staticFilesUrl}${relativePath}`,
    }),
    [casURL, partnerId, staticFilesUrl],
  )
  const appContextValue = useMemo<AppContextValue>(() => ({ Header: headerComponent, token }), [headerComponent, token])

  return (
    <AppContext.Provider value={appContextValue}>
      <CasServicesContext.Provider value={casServices}>
        <App onLoginSucceeded={onLoginSucceeded} authRoutes={authRoutes} />
      </CasServicesContext.Provider>
    </AppContext.Provider>
  )
}
