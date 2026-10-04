import { useActionState } from 'react'
import type { ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router'

import { isAuthenticatorUnsupported, isCeremonyCancelled, isPasskeyAlreadyRegistered, isWrongOrigin, registerWithPasskey } from '#entities/session'
import { isApiError } from '#shared/api/request'
import { MAX_LABEL_LENGTH, normalizeLabel } from '#shared/lib/label'
import { Alert, Hero, Icon, Screen, SubmitButton, SwitchLink, TextField } from '#shared/ui'
import { routes } from '#app/routes'
import { leaveTo, readReturnTo, ReturnToLink } from '#app/returnTo'
import { messages, validateDisplayName } from './validateDisplayName'

/** What the alert above the form says; never the raw `message` of an exception. */
interface Failure {
  title: string
  text: ReactNode
}

const failures = {
  cancelled: {
    title: 'Создание отменено',
    text: 'Окно подтверждения закрылось или вышло время. Ничего не сломалось, попробуйте ещё раз.',
  },
  unsupported: {
    title: 'Не получилось создать пасскей',
    text: 'Этот ключ или браузер не умеет хранить пасскеи с проверкой владельца. Подойдут Touch ID, Face ID, Windows Hello или менеджер паролей на телефоне.',
  },
  alreadyRegistered: {
    title: 'Такой пасскей уже есть',
    text: (
      <>
        Этот пасскей уже зарегистрирован здесь. <ReturnToLink to={routes.SIGN_IN}>Войти</ReturnToLink>
      </>
    ),
  },
  wrongAddress: {
    title: 'Этот адрес не подходит для входа',
    text: 'Сайт открыт не по тому адресу, для которого настроен вход. Откройте его по основному адресу.',
  },
  generic: {
    title: 'Что-то пошло не так',
    text: 'Попробуйте ещё раз через минуту.',
  },
} satisfies Record<string, Failure>

/**
 * Everything a failed ceremony can be, as this screen says it. A challenge
 * the server no longer has (`registration_not_found`) is a ceremony that took
 * too long, the same story as a closed prompt; a credential the server
 * refuses as non-discoverable is the same story as an authenticator that
 * cannot make one. Anything else (an outage, a refused cross-site request,
 * no network, a verification the server could not do) is the generic alert.
 */
const toFailure = (error: unknown): Failure => {
  if (isApiError(error)) {
    switch (error.code) {
      case 'registration_not_found':
        return failures.cancelled
      case 'discoverable_credential_required':
        return failures.unsupported
      case 'credential_already_registered':
        return failures.alreadyRegistered
      default:
        return failures.generic
    }
  }
  if (isCeremonyCancelled(error)) {
    return failures.cancelled
  }
  if (isAuthenticatorUnsupported(error)) {
    return failures.unsupported
  }
  if (isPasskeyAlreadyRegistered(error)) {
    return failures.alreadyRegistered
  }
  if (isWrongOrigin(error)) {
    return failures.wrongAddress
  }
  return failures.generic
}

interface FormState {
  /** What was submitted, so the field keeps it after a failure. */
  displayName: string
  /** A problem with the name itself, shown under the field. */
  nameError: string | null
  /** A problem with the ceremony, shown above the form. */
  failure: Failure | null
}

const initialState: FormState = { displayName: '', nameError: null, failure: null }

/** Opened with an accepted `return_to`, a created account leaves for it instead of the dashboard. */
export const CreateAccountPage = () => {
  const navigate = useNavigate()
  const returnTo = readReturnTo(useLocation().search)

  const [state, createAccount, pending] = useActionState(async (_previous: FormState, form: FormData): Promise<FormState> => {
    // Normalised the way the server does it, so the length check and the sent value agree with it.
    const displayName = normalizeLabel(String(form.get('displayName') ?? ''))
    const nameError = validateDisplayName(displayName)
    if (nameError) {
      return { displayName, nameError, failure: null }
    }
    try {
      await registerWithPasskey(displayName)
    } catch (error) {
      if (isApiError(error) && error.code === 'invalid_display_name') {
        return { displayName, nameError: messages.disallowed, failure: null }
      }
      return { displayName, nameError: null, failure: toFailure(error) }
    }
    // The finish set the session cookie; CAS reads it at `return_to`, the dashboard's loader otherwise.
    await (returnTo ? leaveTo(returnTo) : navigate(routes.DASHBOARD, { replace: true }))
    return { displayName, nameError: null, failure: null }
  }, initialState)

  return (
    <Screen>
      <Hero logoSize={96} title="Создать аккаунт" subtitle="Придумайте имя, остальное сделает браузер. Пароля не будет." />
      <form action={createAccount} className="flex flex-col gap-3.5">
        {state.failure && <Alert title={state.failure.title}>{state.failure.text}</Alert>}
        <TextField
          label="Имя"
          name="displayName"
          placeholder="Как вас называть"
          defaultValue={state.displayName}
          autoComplete="nickname"
          // Twice the cap in UTF-16 units: the check counts code points, and a hard limit here would cut emoji names short.
          maxLength={MAX_LABEL_LENGTH * 2}
          error={state.nameError}
          helper="Его увидят другие игроки, и оно же станет подписью пасскея в вашем менеджере."
        />
        <SubmitButton icon={<Icon name="key" />} pendingLabel="Подтвердите пасскей…">
          {state.failure ? 'Попробовать ещё раз' : 'Создать пасскей'}
        </SubmitButton>
        {pending ? (
          <p className="mt-1.5 text-center text-sm leading-[1.45] font-medium text-ink-muted">Следуйте подсказке браузера или телефона.</p>
        ) : (
          <SwitchLink question="Уже есть аккаунт?">
            <ReturnToLink to={routes.SIGN_IN}>Войти</ReturnToLink>
          </SwitchLink>
        )}
      </form>
    </Screen>
  )
}
