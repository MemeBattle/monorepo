import { isAuthenticatorUnsupported, isCeremonyCancelled, isPasskeyAlreadyRegistered, isWrongOrigin } from '#entities/session'
import { isApiError } from '#shared/api/request'

/** What the alert above the passkeys says when adding one did not go through; never the raw `message` of an exception. */
export interface AddPasskeyFailure {
  title: string
  text: string
}

export const addPasskeyFailures = {
  cancelled: {
    title: 'Добавление отменено',
    text: 'Окно подтверждения закрылось или вышло время. Ничего не сломалось, попробуйте ещё раз.',
  },
  unsupported: {
    title: 'Не получилось добавить пасскей',
    text: 'Этот ключ или браузер не умеет хранить пасскеи с проверкой владельца. Подойдут Touch ID, Face ID, Windows Hello или менеджер паролей на телефоне.',
  },
  alreadyOnThisDevice: {
    title: 'На этом устройстве уже есть пасскей',
    text: 'Он уже привязан к вашему аккаунту. Второй пасскей нужен на другом устройстве: телефоне, ключе или в другом менеджере паролей.',
  },
  wrongAddress: {
    title: 'Этот адрес не подходит для входа',
    text: 'Сайт открыт не по тому адресу, для которого настроен вход. Откройте его по основному адресу.',
  },
  generic: {
    title: 'Что-то пошло не так',
    text: 'Попробуйте ещё раз через минуту.',
  },
} satisfies Record<string, AddPasskeyFailure>

/**
 * Everything a failed addition can be, as the dashboard says it. A challenge
 * the server no longer has (`registration_not_found`) is a ceremony that took
 * too long, the same story as a closed prompt; a credential the server
 * refuses as non-discoverable is the same story as an authenticator that
 * cannot make one; a credential the server already holds
 * (`credential_already_registered`) is the same story as the authenticator
 * refusing the exclude list (`InvalidStateError`): this device is already
 * in. `unauthenticated` is not a failure the alert can say (the session is
 * gone, and the page is not the place to be), so the page reloads instead of
 * asking here. Anything else (an outage, a refused cross-site request, no
 * network, a verification the server could not do) is the generic alert.
 */
export const toAddPasskeyFailure = (error: unknown): AddPasskeyFailure => {
  if (isApiError(error)) {
    switch (error.code) {
      case 'registration_not_found':
        return addPasskeyFailures.cancelled
      case 'discoverable_credential_required':
        return addPasskeyFailures.unsupported
      case 'credential_already_registered':
        return addPasskeyFailures.alreadyOnThisDevice
      default:
        return addPasskeyFailures.generic
    }
  }
  if (isCeremonyCancelled(error)) {
    return addPasskeyFailures.cancelled
  }
  if (isAuthenticatorUnsupported(error)) {
    return addPasskeyFailures.unsupported
  }
  if (isPasskeyAlreadyRegistered(error)) {
    return addPasskeyFailures.alreadyOnThisDevice
  }
  if (isWrongOrigin(error)) {
    return addPasskeyFailures.wrongAddress
  }
  return addPasskeyFailures.generic
}
