import React, { useCallback } from 'react'
import { AuthFrontModule } from '@memebattle/auth-front'
import { useDispatch } from 'react-redux'
import { getMeRequest } from '../../ducks/auth/authActions'
import { useHistory } from 'react-router'
import { routes } from '../../utils/constants'

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

  return <AuthFrontModule onLoginSucceeded={handleLogin} partnerId="605fd1f6c2e5310012e1a497" />
}
