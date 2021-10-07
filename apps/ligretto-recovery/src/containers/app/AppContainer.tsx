import React, { useEffect, useState } from 'react'
import { Routes } from 'components/routes'
import { useSelector } from 'react-redux'
import { selectCurrentUserId } from 'ducks/auth'
import { LoaderScreen } from 'components/screens/loader-screen'

/**
 * [DRAFT]
 *
 * Add a minimum time lag to loading for remove a screen flashing
 *
 * @param isLoading
 * @param ms
 */
const useMinTimeToShowLoader = (isLoading: boolean, ms: number) => {
  const [isMinTimeOver, setIsMinTimeOver] = useState(false)

  useEffect(() => {
    const timerId = setTimeout(() => {
      setIsMinTimeOver(true)
    }, ms)

    return () => clearTimeout(timerId)
  }, [ms])

  return isLoading && isMinTimeOver
}

export const AppContainer = () => {
  const currentUserId = useSelector(selectCurrentUserId)

  const isLoading = useMinTimeToShowLoader(!!currentUserId, 2000)

  return isLoading ? <Routes /> : <LoaderScreen />
}
