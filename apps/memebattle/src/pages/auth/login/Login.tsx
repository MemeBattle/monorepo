import * as React from 'react'
import { Link } from 'components/base'
import { AuthTitle, AuthMainLogo, AuthPage, AuthTip, LoginForm } from 'components/auth'
import { routes } from 'constants.ts'

const LoginPage: React.FC = () => (
  <AuthPage>
    <AuthMainLogo />
    <AuthTitle>Вход</AuthTitle>
    <LoginForm onSubmit={console.log} />
    <AuthTip>
      Нет аккаунта? <br />
      <Link to={routes.SIGN_UP}>Зарегистрироваться</Link>
    </AuthTip>
  </AuthPage>
)

export default LoginPage
