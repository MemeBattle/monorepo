import { useActionState } from 'react'
import type { ReactNode } from 'react'
import { useLoaderData, useLocation, useNavigate, useRevalidator } from 'react-router'

import {
  getMe,
  isAuthenticatorUnsupported,
  isCeremonyCancelled,
  isNotTheGuest,
  isPasskeyAlreadyRegistered,
  isWrongOrigin,
  registerWithPasskey,
} from '#entities/session'
import type { Me, RegisterWithPasskeyErrorCode } from '#entities/session'
import type { ApiFailure } from '#shared/api/client'
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
  guestSessionEnded: {
    title: 'Гостевая сессия закончилась',
    text: 'Сохранить прогресс гостя отсюда уже не получится. Вернитесь в игру и начните создание аккаунта оттуда.',
  },
} satisfies Record<string, Failure>

/** How a ceremony failed: a failure the server declared, or something thrown (the authenticator, an outage). */
type Failed = { failure: ApiFailure<RegisterWithPasskeyErrorCode> } | { thrown: unknown }

/**
 * A failure the server declared, as this screen says it. A challenge the
 * server no longer has (`registration_not_found`) is a ceremony that took
 * too long, the same story as a closed prompt; a credential the server
 * refuses as non-discoverable is the same story as an authenticator that
 * cannot make one. Anything else (a refused cross-site request, a
 * verification the server could not do) is the generic alert.
 */
const toFailure = (failure: ApiFailure<RegisterWithPasskeyErrorCode>): Failure => {
  switch (failure.code) {
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

/** A thrown failure, as this screen says it: the authenticator's verdicts, and the generic alert for an outage or no network. */
const toThrownFailure = (error: unknown): Failure => {
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

/**
 * What a failed upgrade is when it is about the guest's session rather than
 * the ceremony, or `null` to map it as a plain registration. The session, not
 * the request, makes CAS upgrade, so a session that ended under the screen
 * must never pass for a ceremony to retry: the next submit would create a new
 * account. A challenge for someone else (`isNotTheGuest`) and
 * `unauthenticated` are a lost session. `registration_not_found` is either an
 * expired challenge or an upgrade ceremony whose session is gone, so the
 * session is read again to tell which.
 */
const toUpgradeFailure = async (failed: Failed, guest: Me): Promise<Failure | null> => {
  if ('thrown' in failed ? isNotTheGuest(failed.thrown) : failed.failure.code === 'unauthenticated') {
    return failures.guestSessionEnded
  }
  if (!('failure' in failed) || failed.failure.code !== 'registration_not_found') {
    return null
  }
  let reading: Awaited<ReturnType<typeof getMe>>
  try {
    reading = await getMe()
  } catch {
    return failures.generic
  }
  if (!reading.ok) {
    return reading.error.code === 'unauthenticated' ? failures.guestSessionEnded : failures.generic
  }
  const now = reading.data
  return now.accountType === 'guest' && now.accountId === guest.accountId ? failures.cancelled : failures.guestSessionEnded
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

/**
 * Opened with an accepted `return_to`, a created account leaves for it instead of the dashboard. Opened by a guest (the
 * gate hands its `Me` over), the same form upgrades the guest and says that the game data stays
 * (docs/adr/0003-guest-in-the-app.md).
 */
export const CreateAccountPage = () => {
  const navigate = useNavigate()
  const revalidator = useRevalidator()
  const returnTo = readReturnTo(useLocation().search)
  // Optional chaining: the route may have no loader at all.
  const loaded = useLoaderData<Me | null | undefined>()
  const guest = loaded?.accountType === 'guest' ? loaded : null

  const [state, createAccount, pending] = useActionState(async (_previous: FormState, form: FormData): Promise<FormState> => {
    // Normalised the way the server does it, so the length check and the sent value agree with it.
    const displayName = normalizeLabel(String(form.get('displayName') ?? ''))
    const nameError = validateDisplayName(displayName)
    if (nameError) {
      return { displayName, nameError, failure: null }
    }
    let failed: Failed | null = null
    try {
      const result = await (guest ? registerWithPasskey(displayName, { accountId: guest.accountId }) : registerWithPasskey(displayName))
      if (!result.ok) {
        failed = { failure: result.error }
      }
    } catch (thrown) {
      failed = { thrown }
    }
    if (failed) {
      if ('failure' in failed && failed.failure.code === 'invalid_display_name') {
        return { displayName, nameError: messages.disallowed, failure: null }
      }
      const upgradeFailure = guest ? await toUpgradeFailure(failed, guest) : null
      if (upgradeFailure === failures.guestSessionEnded) {
        // The gate decides again: a full session is forwarded, no session leaves the plain screen.
        await revalidator.revalidate()
      }
      return {
        displayName,
        nameError: null,
        failure: upgradeFailure ?? ('failure' in failed ? toFailure(failed.failure) : toThrownFailure(failed.thrown)),
      }
    }
    // The finish set the session cookie; CAS reads it at `return_to`, the dashboard's loader otherwise.
    await (returnTo ? leaveTo(returnTo) : navigate(routes.DASHBOARD, { replace: true }))
    return { displayName, nameError: null, failure: null }
  }, initialState)

  return (
    <Screen>
      <Hero
        logoSize={96}
        title="Создать аккаунт"
        subtitle={
          guest
            ? 'Игровой прогресс останется с вами: гостевой аккаунт станет постоянным. Придумайте имя, остальное сделает браузер. Пароля не будет.'
            : 'Придумайте имя, остальное сделает браузер. Пароля не будет.'
        }
      />
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
