import { App } from './App'
import { CasServicesContext } from './modules/cas-services'
import type { FC } from 'react'
import React, { useMemo } from 'react'
import { createFrontServices } from '@memebattle/cas-services'

export interface AuthFrontModuleProps {
  partnerId: string
}

export const AuthFrontModule: FC<AuthFrontModuleProps> = ({ partnerId }) => {
  const casServices = useMemo(() => createFrontServices({ partnerId, casURI: 'https://cas.mems.fun/api' }), [partnerId])

  return (
    <CasServicesContext.Provider value={casServices}>
      <App />
    </CasServicesContext.Provider>
  )
}
