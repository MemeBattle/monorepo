import { useDeferredValue, ViewTransition } from 'react'
import { useSelector } from 'react-redux'

import { useMinTimeLoading } from '#shared/lib/hooks/useMinTimeLoader'
import { LoaderScreen } from '#shared/ui/screens/LoaderScreen'
import { isIdentityPendingSelector } from '#ducks/auth'
import { Routes } from './routes'

export const AppContainer = () => {
  const isIdentityPending = useSelector(isIdentityPendingSelector)

  const isLoading = useMinTimeLoading(isIdentityPending, 2000)

  const isLoaderShown = useDeferredValue(isLoading)

  return isLoaderShown ? (
    <ViewTransition>
      <LoaderScreen />
    </ViewTransition>
  ) : (
    <Routes />
  )
}

AppContainer.displayName = 'AppContainer'
