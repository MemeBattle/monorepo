import React, { useCallback } from 'react'
import { AuthFrontModule } from '@memebattle/auth-front'
import { useDispatch, useSelector } from 'react-redux'
import { useHistory } from 'react-router'
import { LigrettoLogo, ThemeProvider, ligrettoAuthTheme } from '@memebattle/ligretto-ui'

import { MainLayout } from 'components/layouts/main'
import { routes } from 'utils/constants'
import { getMeRequest } from 'ducks/auth/authActions'
import { tokenSelector } from 'ducks/auth'

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
          staticFilesUrl={process.env.REACT_APP_CAS_STATIC || 'https://cas.mems.fun/static'}
          onLoginSucceeded={handleLogin}
          partnerId={process.env.REACT_APP_CAS_PARTNER_ID || ''}
          token={token}
          headerComponent={<LigrettoLogo />}
        />
      </MainLayout>
    </ThemeProvider>
  )
}
