import { Link } from 'react-router'

import { Hero, Screen, SwitchLink } from '#shared/ui'
import { routes } from '#app/routes'

/** The hero and the way to create an account; the passkey button itself comes with #713. */
export const SignInPage = () => (
  <Screen>
    <Hero title="Вход в MemeBattle" subtitle="Без пароля. Один пасскей для всех игр." />
    <SwitchLink question="Нет аккаунта?">
      <Link to={routes.CREATE_ACCOUNT}>Создать</Link>
    </SwitchLink>
  </Screen>
)
