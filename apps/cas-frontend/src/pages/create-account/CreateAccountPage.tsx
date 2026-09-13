import { Link } from 'react-router'

import { routes } from '#app/routes'

export const CreateAccountPage = () => (
  <>
    <h1 className="text-2xl font-semibold tracking-tight">Создать аккаунт</h1>
    <p className="text-neutral-600 dark:text-neutral-400">Новый аккаунт защищается ключом доступа вашего устройства.</p>
    <Link className="font-medium text-blue-600 underline-offset-4 hover:underline dark:text-blue-400" to={routes.SIGN_IN}>
      У меня уже есть аккаунт
    </Link>
  </>
)
