import { useActionState, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'

import { isCeremonyCancelled, isWrongOrigin, signInWithPasskey, signInWithPasskeyFromAutofill } from '#entities/session'
import { isApiError } from '#shared/api/request'
import { Alert, Hero, Icon, Screen, SubmitButton, SwitchLink, TextField } from '#shared/ui'
import { routes } from '#app/routes'

/** What the alert above the form says; never the raw `message` of an exception. */
interface Failure {
  title: string
  text: ReactNode
  /** What the button offers once the alert is up. */
  retry: string
}

const failures = {
  cancelled: {
    title: 'Вход отменён',
    text: 'Окно подтверждения закрылось или вышло время. Ничего не сломалось, попробуйте ещё раз.',
    retry: 'Попробовать ещё раз',
  },
  unknownPasskey: {
    title: 'Этот пасскей здесь не зарегистрирован',
    text: (
      <>
        Возможно, он от другого сайта, или аккаунта ещё нет. <Link to={routes.CREATE_ACCOUNT}>Создать аккаунт</Link>
      </>
    ),
    retry: 'Выбрать другой пасскей',
  },
  wrongAddress: {
    title: 'Этот адрес не подходит для входа',
    text: 'Сайт открыт не по тому адресу, для которого настроен вход. Откройте его по основному адресу.',
    retry: 'Попробовать ещё раз',
  },
  generic: {
    title: 'Что-то пошло не так',
    text: 'Попробуйте ещё раз через минуту.',
    retry: 'Попробовать ещё раз',
  },
} satisfies Record<string, Failure>

/**
 * Everything a failed sign-in can be, as this screen says it. A challenge
 * the server no longer has (`login_not_found`) is a ceremony that took too
 * long, the same story as a closed prompt. Anything else (an outage, a
 * refused cross-site request, no network) is the generic alert.
 */
const toFailure = (error: unknown): Failure => {
  if (isApiError(error)) {
    switch (error.code) {
      case 'invalid_credential':
        return failures.unknownPasskey
      case 'login_not_found':
        return failures.cancelled
      default:
        return failures.generic
    }
  }
  if (isCeremonyCancelled(error)) {
    return failures.cancelled
  }
  if (isWrongOrigin(error)) {
    return failures.wrongAddress
  }
  return failures.generic
}

/**
 * Two ways in, one ceremony at a time: the browser's autofill offers a
 * passkey under the field from the moment the screen is up, and the button
 * withdraws that offer before starting its own prompt. Leaving the screen
 * withdraws it too.
 */
export const SignInPage = () => {
  const navigate = useNavigate()
  const autofill = useRef<AbortController | null>(null)
  const [autofillFailure, setAutofillFailure] = useState<Failure | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    autofill.current = controller
    signInWithPasskeyFromAutofill(controller.signal).then(
      signedIn => (signedIn ? navigate(routes.DASHBOARD, { replace: true }) : undefined),
      (error: unknown) => {
        if (!controller.signal.aborted) {
          setAutofillFailure(toFailure(error))
        }
      },
    )
    return () => controller.abort()
  }, [navigate])

  const [buttonFailure, signIn, pending] = useActionState(async (): Promise<Failure | null> => {
    autofill.current?.abort()
    setAutofillFailure(null)
    try {
      await signInWithPasskey()
    } catch (error) {
      return toFailure(error)
    }
    // The finish set the session cookie; the dashboard's loader reads it.
    await navigate(routes.DASHBOARD, { replace: true })
    return null
  }, null)

  // The button resets the autofill's verdict when pressed, so whichever is set is the latest.
  const failure = autofillFailure ?? buttonFailure

  return (
    <Screen>
      <Hero title="Вход в MemeBattle" subtitle="Без пароля. Один пасскей для всех игр." />
      <form action={signIn} className="flex flex-col gap-3.5">
        {failure && <Alert title={failure.title}>{failure.text}</Alert>}
        {/* Nobody types here: the browser anchors its passkey autofill to this field. */}
        <TextField
          label="Пасскей"
          name="passkey"
          placeholder="Браузер предложит сохранённый"
          autoComplete="username webauthn"
          icon={<Icon name="key" />}
        />
        <SubmitButton pendingLabel="Подтвердите пасскей…">{failure ? failure.retry : 'Войти с пасскеем'}</SubmitButton>
        {pending ? (
          <p className="mt-1.5 text-center text-sm leading-[1.45] font-medium text-ink-muted">
            Следуйте подсказке браузера или телефона. Окно можно закрыть, тогда вход отменится.
          </p>
        ) : (
          <SwitchLink question="Нет аккаунта?">
            <Link to={routes.CREATE_ACCOUNT}>Создать</Link>
          </SwitchLink>
        )}
      </form>
    </Screen>
  )
}
