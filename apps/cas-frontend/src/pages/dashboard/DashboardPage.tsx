import { Link } from 'react-router'

import { routes } from '#app/routes'

export const DashboardPage = () => (
  <>
    <h1 className="text-2xl font-semibold tracking-tight">Личный кабинет</h1>
    <p className="text-neutral-600 dark:text-neutral-400">Здесь будут ваши ключи доступа и настройки аккаунта.</p>
    <nav className="flex flex-wrap gap-4">
      <Link className="font-medium text-blue-600 underline-offset-4 hover:underline dark:text-blue-400" to={routes.SIGN_IN}>
        Вход
      </Link>
      <Link className="font-medium text-blue-600 underline-offset-4 hover:underline dark:text-blue-400" to={routes.CREATE_ACCOUNT}>
        Создать аккаунт
      </Link>
    </nav>
  </>
)
