import * as React from 'react'
import { AuthTitle, AuthMainLogo, AuthPage, RegistrationForm } from 'components/auth'

const LoginPage: React.FC = () => (
  <AuthPage>
    <AuthMainLogo />
    <AuthTitle>Регистрация</AuthTitle>
    <RegistrationForm onSubmit={console.log} />
  </AuthPage>
)

export default LoginPage
