import * as React from 'react'
import { AuthPage, LoginForm } from 'components/auth'

const LoginPage: React.FC = () => (
  <AuthPage>
    <LoginForm onSubmit={console.log} />
  </AuthPage>
)

export default LoginPage
