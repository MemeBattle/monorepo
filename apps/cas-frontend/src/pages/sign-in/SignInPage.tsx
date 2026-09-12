import { Link } from 'react-router'

import { routes } from '#app/routes'

export const SignInPage = () => (
  <>
    <h1 className="text-2xl font-semibold tracking-tight">Вход</h1>
    <p className="text-neutral-600 dark:text-neutral-400">Войдите в аккаунт по ключу доступа — пароль не нужен.</p>
    <Link className="font-medium text-blue-600 underline-offset-4 hover:underline dark:text-blue-400" to={routes.CREATE_ACCOUNT}>
      Создать аккаунт
    </Link>
  </>
)
