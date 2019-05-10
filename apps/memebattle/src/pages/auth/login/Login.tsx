import * as React from 'react'
import { Link } from 'components/base'
import { AuthTitle, AuthMainLogo, AuthPage, AuthTip } from 'components/auth'
import { LoginFormContainer } from 'containers/auth'
import { routes } from 'constants.ts'

const LoginPage: React.FC = () => (
  <AuthPage>
    <AuthMainLogo />
    <AuthTitle>Вход</AuthTitle>
    <LoginFormContainer />
    <AuthTip>
      Нет аккаунта? <br />
      <Link to={routes.SIGN_UP}>Зарегистрироваться</Link>
    </AuthTip>
  </AuthPage>
)

export default LoginPage
