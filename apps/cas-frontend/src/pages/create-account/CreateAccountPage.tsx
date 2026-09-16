import { useActionState } from 'react'
import { Link, useNavigate } from 'react-router'

import { isCeremonyCancelled, registerWithPasskey } from '#entities/session'
import { isApiError } from '#shared/api/request'
import { GENERIC_FAILURE } from '#shared/errors/failure'
import type { Failure } from '#shared/errors/failure'
import { Alert, Hero, Icon, Screen, SubmitButton, SwitchLink, TextField } from '#shared/ui'
import { routes } from '#app/routes'
import { MAX_DISPLAY_NAME_LENGTH, messages, normalizeDisplayName, validateDisplayName } from './validateDisplayName'

const CANCELLED: Failure = {
  title: 'Создание отменено',
  text: 'Окно подтверждения закрылось или вышло время. Ничего не сломалось, попробуйте ещё раз.',
}

/** What this screen can say about a failed ceremony; the rest of what it can get is #715. */
const toFailure = (error: unknown): Failure => (isCeremonyCancelled(error) ? CANCELLED : GENERIC_FAILURE)

interface FormState {
  /** What was submitted, so the field keeps it after a failure. */
  displayName: string
  /** A problem with the name itself, shown under the field. */
  nameError: string | null
  /** A problem with the ceremony, shown above the form. */
  failure: Failure | null
}

const initialState: FormState = { displayName: '', nameError: null, failure: null }

export const CreateAccountPage = () => {
  const navigate = useNavigate()

  const [state, createAccount, pending] = useActionState(async (_previous: FormState, form: FormData): Promise<FormState> => {
    // Normalised the way the server does it, so the length check and the sent value agree with it.
    const displayName = normalizeDisplayName(String(form.get('displayName') ?? ''))
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
    // The finish set the session cookie; the dashboard's loader reads it.
    await navigate(routes.DASHBOARD, { replace: true })
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
          maxLength={MAX_DISPLAY_NAME_LENGTH * 2}
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
            <Link to={routes.SIGN_IN}>Войти</Link>
          </SwitchLink>
        )}
      </form>
    </Screen>
  )
}
