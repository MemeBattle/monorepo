import React from 'react'
import { Routes } from 'components/routes'
import { useSelector } from 'react-redux'
import { selectCurrentUserId } from 'ducks/auth'
import { LoaderScreen } from 'components/screens/loader-screen'
import { useMinTimeToShowLoader } from 'hooks'

export const AppContainer = () => {
  const currentUserId = useSelector(selectCurrentUserId)

  const isLoading = useMinTimeToShowLoader(!!currentUserId, 2000)

  return isLoading ? <Routes /> : <LoaderScreen />
}

AppContainer.displayName = 'AppContainer'
