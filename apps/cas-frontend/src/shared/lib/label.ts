/**
 * A label is a short user-facing string CAS shows as-is: the account's
 * display name, a passkey's name. The rules are the server's
 * (`apps/cas/src/shared/label.rs`); the client repeats the ones it can check
 * before sending, so a screen answers without a round trip and counts the
 * same characters the server does.
 */

/** The server's cap (`MAX_LABEL_LENGTH` in apps/cas), counted in code points as there. */
export const MAX_LABEL_LENGTH = 64

/**
 * What CAS does to a label before judging it (`sanitize_label`), in the same
 * order: every Unicode space separator (category Zs) becomes an ASCII space,
 * the result is put in NFC, then leading and trailing spaces go and runs of
 * spaces collapse to one. Only ASCII spaces are trimmed, not `trim()`'s
 * wider set: a zero-width space at the edge is something the server
 * rejects, not something to hide. The normalised value is what gets
 * validated and sent, so the client and the server count the same
 * characters.
 */
export const normalizeLabel = (label: string): string =>
  label
    .replace(/\p{Zs}/gu, ' ')
    .normalize('NFC')
    .replace(/ +/g, ' ')
    .replace(/^ | $/g, '')

export type LabelProblem = 'empty' | 'tooLong'

/**
 * What the client can tell before asking the server: emptiness and length,
 * on a label already through `normalizeLabel`. Character rules stay on the
 * server, which answers `invalid_display_name` or `invalid_passkey_name`.
 * The screen turns the problem into its own words.
 */
export const labelProblem = (label: string): LabelProblem | null => {
  if (label.length === 0) {
    return 'empty'
  }
  if ([...label].length > MAX_LABEL_LENGTH) {
    return 'tooLong'
  }
  return null
}
