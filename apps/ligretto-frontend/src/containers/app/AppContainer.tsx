import React from 'react'
import { useSelector } from 'react-redux'

import { useMinTimeLoading } from 'hooks/useMinTimeLoader'
import { Routes } from 'components/routes'
import { isUserLoadingSelector } from 'ducks/auth'
import { LoaderScreen } from 'components/screens/LoaderScreen'

export const AppContainer = () => {
  const isUserLoading = useSelector(isUserLoadingSelector)

  const isLoading = useMinTimeLoading(isUserLoading, 2000)

  return isLoading ? <LoaderScreen /> : <Routes />
}

AppContainer.displayName = 'AppContainer'
