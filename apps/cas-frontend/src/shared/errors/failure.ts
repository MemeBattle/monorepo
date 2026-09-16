/**
 * What a screen shows when something failed: a title and a sentence, in
 * Russian, never the raw `message` of an exception.
 */
export interface Failure {
  title: string
  text: string
}

/**
 * For a failure no screen can name. The ones a screen can name (a cancelled
 * ceremony, a rejected name) are mapped next to that screen, where the
 * failure can actually happen; nothing screen-specific lives here.
 */
export const GENERIC_FAILURE: Failure = {
  title: 'Что-то пошло не так',
  text: 'Попробуйте ещё раз через минуту.',
}
