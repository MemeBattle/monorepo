import { MAX_LABEL_LENGTH, labelProblem } from '#shared/lib/label'

export const messages = {
  empty: 'Введите имя.',
  tooLong: `Слишком длинное имя, максимум ${MAX_LABEL_LENGTH} символа.`,
  /** The server's `invalid_display_name` for anything the client did not catch: invisible or direction-changing characters. */
  disallowed: 'Имя содержит недопустимые символы.',
} as const

/**
 * What this screen says about a name already through `normalizeLabel`, or
 * `null` for a name worth sending. The rules are the label's
 * (`#shared/lib/label`); only the words are this screen's.
 */
export const validateDisplayName = (name: string): string | null => {
  const problem = labelProblem(name)
  return problem ? messages[problem] : null
}
