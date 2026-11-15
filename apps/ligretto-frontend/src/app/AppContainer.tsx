import { useDeferredValue, ViewTransition } from 'react'
import { useSelector } from 'react-redux'

import { useMinTimeLoading } from '#shared/lib/hooks/useMinTimeLoader'
import { LoaderScreen } from '#shared/ui/screens/LoaderScreen'
import { isIdentityPendingSelector } from '#ducks/auth'
import { Routes } from './routes'

export const AppContainer = () => {
  const isIdentityPending = useSelector(isIdentityPendingSelector)

  const isLoading = useMinTimeLoading(isIdentityPending, 2000)

  // React animates <ViewTransition> only in transition-priority renders, and the auth state comes from Redux, whose
  // updates are synchronous. The deferred value moves the switch from the loader to the routes into such a render.
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
