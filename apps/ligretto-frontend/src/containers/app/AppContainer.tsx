import React from 'react'
import { useSelector } from 'react-redux'

import { useMinTimeToShowLoader } from 'hooks/useMinTimeLoader'
import { Routes } from 'components/routes'
import { currentUserIdSelector } from 'ducks/auth'
import { LoaderScreen } from 'components/screens/loader-screen'

export const AppContainer = () => {
  const currentUserId = useSelector(currentUserIdSelector)

  const isLoading = useMinTimeToShowLoader(!!currentUserId, 2000)

  return isLoading ? <Routes /> : <LoaderScreen />
}

AppContainer.displayName = 'AppContainer'
