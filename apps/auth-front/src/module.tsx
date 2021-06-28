import { App } from './App'
import { CasServicesContext } from './modules/cas-services'
import type { FC } from 'react'
import React, { useMemo } from 'react'
import { createFrontServices } from '@memebattle/cas-services'

export interface AuthFrontModuleProps {
  onLoginSucceeded: ({ token }: { token: string }) => void
  partnerId: string
  staticFilesUrl: string
}

export const AuthFrontModule: FC<AuthFrontModuleProps> = ({ partnerId, onLoginSucceeded, staticFilesUrl }) => {
  const casServices = useMemo(
    () => ({
      ...createFrontServices({ partnerId, casURI: process.env.REACT_APP_CAS_URL || 'https://cas.mems.fun/api' }),
      getAbsoluteUrl: (relativePath: string) => `${staticFilesUrl}${relativePath}`,
    }),
    [partnerId, staticFilesUrl],
  )

  return (
    <CasServicesContext.Provider value={casServices}>
      <App onLoginSucceeded={onLoginSucceeded} />
    </CasServicesContext.Provider>
  )
}
