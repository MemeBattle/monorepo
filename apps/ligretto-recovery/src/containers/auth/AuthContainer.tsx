import React, { useCallback } from 'react'
import { AuthFrontModule } from '@memebattle/auth-front'
import { getMe } from '../../api'

export const AuthContainer = () => {
  const handleLogin = useCallback(async ({ token }: { token: string }) => {
    const response = await getMe(token)
    console.log(response)
  }, [])

  return <AuthFrontModule onLoginSucceeded={handleLogin} partnerId="605fd1f6c2e5310012e1a497" />
}
