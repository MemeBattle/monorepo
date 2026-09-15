import { isRouteErrorResponse, useRouteError } from 'react-router'

import { isApiError } from '#shared/api/request'
import { Alert, Button, Hero, Screen } from '#shared/ui'
import { routes } from '#app/routes'

interface Recovery {
  title: string
  text: string
  action: string
  to: string
}

/**
 * The root error boundary: a loader failed or a route does not exist. Until
 * the auth gate (#712) redirects, a dashboard opened without a session lands
 * here too, with the way to sign in.
 */
const recoveryFor = (error: unknown): Recovery => {
  if (isRouteErrorResponse(error) && error.status === 404) {
    return { title: 'Такой страницы нет', text: 'Проверьте адрес или вернитесь на главную.', action: 'На главную', to: routes.DASHBOARD }
  }
  if (isApiError(error) && error.code === 'unauthenticated') {
    return { title: 'Вы не вошли', text: 'Войдите или создайте аккаунт.', action: 'Войти', to: routes.SIGN_IN }
  }
  return { title: 'Что-то пошло не так', text: 'Попробуйте ещё раз через минуту.', action: 'Попробовать ещё раз', to: routes.DASHBOARD }
}

export const ErrorScreen = () => {
  const { title, text, action, to } = recoveryFor(useRouteError())

  return (
    <Screen>
      <Hero logoSize={96} title="MemeBattle" subtitle="Единый вход для всех игр." />
      <div className="flex flex-col gap-3.5">
        <Alert title={title}>{text}</Alert>
        {/* A full navigation, not a router one: the boundary must be left behind and the loaders run afresh. */}
        <Button onClick={() => window.location.assign(to)}>{action}</Button>
      </div>
    </Screen>
  )
}
