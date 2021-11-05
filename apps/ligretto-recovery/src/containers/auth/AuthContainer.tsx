import React, { useCallback } from 'react'
import { AuthFrontModule } from '@memebattle/auth-front'
import { useDispatch } from 'react-redux'
import { useHistory } from 'react-router'
import { LigrettoLogo, ThemeProvider, ligrettoAuthTheme } from '@memebattle/ligretto-ui'

import { MainLayout } from 'components/layouts/main'
import { routes } from 'utils/constants'
import { getMeRequest } from 'ducks/auth/authActions'

export const AuthContainer = () => {
  const dispatch = useDispatch()
  const history = useHistory()

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
          staticFilesUrl={process.env.REACT_APP_CAS_STATIC || 'https://cas.mems.fun/static'}
          onLoginSucceeded={handleLogin}
          partnerId={process.env.REACT_APP_CAS_PARTNER_ID || ''}
          headerComponent={<LigrettoLogo />}
        />
      </MainLayout>
    </ThemeProvider>
  )
}
