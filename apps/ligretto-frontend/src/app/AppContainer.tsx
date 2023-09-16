import { useSelector } from 'react-redux'

import { useMinTimeLoading } from 'shared/lib/hooks/useMinTimeLoader'
import { LoaderScreen } from 'shared/ui/screens/LoaderScreen'
import { isUserLoadingSelector } from 'ducks/auth'
import { Routes } from './routes'

export const AppContainer = () => {
  const isUserLoading = useSelector(isUserLoadingSelector)

  const isLoading = useMinTimeLoading(isUserLoading, 2000)

  return isLoading ? <LoaderScreen /> : <Routes />
}

AppContainer.displayName = 'AppContainer'
