import React from 'react'
import { useStore } from 'hooks'
import { LoginForm } from 'components/auth'

const LoginFormContainer: React.FC = () => {
  const authStore = useStore(store => store.auth)

  return <LoginForm onSubmit={() => authStore.login()} />
}

export default LoginFormContainer
