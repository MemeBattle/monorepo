import React, { useCallback } from 'react'
import { AuthFrontModule } from '@memebattle/auth-front'
import { useDispatch, useSelector } from 'react-redux'
import { useNavigate } from 'react-router'
import { ThemeProvider } from '@memebattle/ui'

import { MainLayout } from '#shared/ui/layouts/main'
import { LigrettoLogo } from '#shared/ui/LigrettoLogo'
import { routes } from '#shared/constants'
import { getMeRequest } from '#ducks/auth/authActions'
import { accessTokenSelector } from '#ducks/auth'
import { ligrettoAuthTheme } from './themes/ligrettoAuth'

import { CAS_STATIC_URL, CAS_PARTNER_ID, CAS_URL } from '#shared/constants/config'

export const AuthContainer = () => {
  const dispatch = useDispatch()
  const navigate = useNavigate()

  const token = useSelector(accessTokenSelector)

  // The legacy token this module hands over means nothing to the core backend; the bootstrap reads the session cookie.
  const handleLogin = useCallback(() => {
    navigate(routes.HOME)
    dispatch(getMeRequest())
  }, [dispatch, navigate])

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
