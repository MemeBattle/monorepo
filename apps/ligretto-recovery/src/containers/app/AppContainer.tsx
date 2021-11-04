import React from 'react'
import { useSelector } from 'react-redux'

import { useMinTimeToShowLoader } from 'hooks'
import { Routes } from 'components/routes'
import { selectCurrentUserId } from 'ducks/auth'
import { LoaderScreen } from 'components/screens/loader-screen'

export const AppContainer = () => {
  const currentUserId = useSelector(selectCurrentUserId)

  const isLoading = useMinTimeToShowLoader(!!currentUserId, 2000)

  return isLoading ? <Routes /> : <LoaderScreen />
}

AppContainer.displayName = 'AppContainer'
