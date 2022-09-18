import React, { useCallback } from 'react'
import { AuthFrontModule } from '@memebattle/auth-front'
import { useDispatch, useSelector } from 'react-redux'
import { useHistory } from 'react-router'
import { ThemeProvider } from '@memebattle/ui'

import { MainLayout } from 'components/layouts/main'
import { LigrettoLogo } from 'components/LigrettoLogo'
import { routes } from 'utils/constants'
import { getMeRequest } from 'ducks/auth/authActions'
import { tokenSelector } from 'ducks/auth'
import { ligrettoAuthTheme } from '../../themes/ligrettoAuth'

import { CAS_STATIC_URL, CAS_PARTNER_ID, CAS_URL } from 'config'

export const AuthContainer = () => {
  const dispatch = useDispatch()
  const history = useHistory()

  const token = useSelector(tokenSelector)

  const handleLogin = useCallback(
    ({ token }: { token: string }) => {
      history.push(routes.HOME)
      dispatch(getMeRequest({ token }))
    },
    [dispatch, history],
  )

  return (
    <ThemeProvider theme={ligrettoAuthTheme}>
      <MainLayout>
        <AuthFrontModule
          staticFilesUrl={CAS_STATIC_URL}
          onLoginSucceeded={handleLogin}
          partnerId={CAS_PARTNER_ID}
          token={token}
          headerComponent={<LigrettoLogo />}
          casURL={CAS_URL}
        />
      </MainLayout>
    </ThemeProvider>
  )
}
