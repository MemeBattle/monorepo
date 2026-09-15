/** The server's cap (`MAX_LABEL_LENGTH` in apps/cas), counted in code points as there. */
export const MAX_DISPLAY_NAME_LENGTH = 64

export const messages = {
  empty: 'Введите имя.',
  tooLong: `Слишком длинное имя, максимум ${MAX_DISPLAY_NAME_LENGTH} символа.`,
  /** The server's `invalid_display_name` for anything the client did not catch: invisible or direction-changing characters. */
  disallowed: 'Имя содержит недопустимые символы.',
} as const

/**
 * What the client can tell before asking the server: emptiness and length.
 * Character rules stay on the server, which answers `invalid_display_name`.
 * Returns the message to show under the field, or `null` for a name worth
 * sending.
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
