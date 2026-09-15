/**
 * What a screen shows when a ceremony or a request fails: a title and a
 * sentence, in Russian, never the raw `message` of an exception.
 *
 * This is the minimal mapping the create-account slice needs; the full one
 * over every API code and `DOMException` name is #715.
 */
export interface Failure {
  title: string
  text: string
}

/** Which ceremony failed; the cancelled title names it. */
export type FailureContext = 'createAccount'

const cancelledTitle: Record<FailureContext, string> = {
  createAccount: 'Создание отменено',
}

const GENERIC: Failure = {
  title: 'Что-то пошло не так',
  text: 'Попробуйте ещё раз через минуту.',
}

/**
 * The name of a thrown error, whatever realm it came from. `instanceof Error`
 * is not used: `@simplewebauthn/browser` rethrows a `DOMException` as its own
 * `WebAuthnError` that keeps the name, and under jsdom a `DOMException` is
 * not an instance of the test runner's `Error`.
 */
const nameOf = (error: unknown): string | null =>
  typeof error === 'object' && error !== null && 'name' in error && typeof error.name === 'string' ? error.name : null

/**
 * `NotAllowedError` is the browser's word for a cancelled or timed-out
 * ceremony: the user closed the prompt, or nobody answered it. Everything
 * else is generic until #715 names it.
 */
export const toFailure = (error: unknown, context: FailureContext): Failure => {
  if (nameOf(error) === 'NotAllowedError') {
    return {
      title: cancelledTitle[context],
      text: 'Окно подтверждения закрылось или вышло время. Ничего не сломалось, попробуйте ещё раз.',
    }
  }
  return GENERIC
}
