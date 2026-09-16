/** The server's cap (`MAX_LABEL_LENGTH` in apps/cas), counted in code points as there. */
export const MAX_DISPLAY_NAME_LENGTH = 64

export const messages = {
  empty: 'Введите имя.',
  tooLong: `Слишком длинное имя, максимум ${MAX_DISPLAY_NAME_LENGTH} символа.`,
  /** The server's `invalid_display_name` for anything the client did not catch: invisible or direction-changing characters. */
  disallowed: 'Имя содержит недопустимые символы.',
} as const

/**
 * What CAS does to a label before judging it (`sanitize_label` in
 * apps/cas/src/shared/label.rs), in the same order: every Unicode space
 * separator (category Zs) becomes an ASCII space, the result is put in NFC,
 * then leading and trailing spaces go and runs of spaces collapse to one.
 * Only ASCII spaces are trimmed, not `trim()`'s wider set: a zero-width
 * space at the edge is something the server rejects, not something to hide.
 * The normalised value is what gets validated and sent, so the client and
 * the server count the same characters.
 */
export const normalizeDisplayName = (name: string): string =>
  name
    .replace(/\p{Zs}/gu, ' ')
    .normalize('NFC')
    .replace(/ +/g, ' ')
    .replace(/^ | $/g, '')

/**
 * What the client can tell before asking the server: emptiness and length,
 * on a name already through `normalizeDisplayName`. Character rules stay on
 * the server, which answers `invalid_display_name`. Returns the message to
 * show under the field, or `null` for a name worth sending.
 */
export const validateDisplayName = (name: string): string | null => {
  if (name.length === 0) {
    return messages.empty
  }
  if ([...name].length > MAX_DISPLAY_NAME_LENGTH) {
    return messages.tooLong
  }
  return null
}
