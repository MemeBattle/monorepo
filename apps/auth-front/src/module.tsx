import { App } from './App'
import { CasServicesContext } from './modules/cas-services'
import type { FC } from 'react'
import React, { useMemo } from 'react'
import { createFrontServices } from '@memebattle/cas-services'

export interface AuthFrontModuleProps {
  onLoginSucceeded: ({ token }: { token: string }) => void
  partnerId: string
  casUrl: string
  staticFilesUrl: string
}

export const AuthFrontModule: FC<AuthFrontModuleProps> = ({ partnerId, onLoginSucceeded, casUrl, staticFilesUrl }) => {
  const casServices = useMemo(
    () => ({ ...createFrontServices({ partnerId, casURI: casUrl }), getAbsoluteUrl: (relativePath: string) => `${staticFilesUrl}${relativePath}` }),
    [casUrl, partnerId, staticFilesUrl],
  )

  return (
    <CasServicesContext.Provider value={casServices}>
      <App onLoginSucceeded={onLoginSucceeded} />
    </CasServicesContext.Provider>
  )
}
