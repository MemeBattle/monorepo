const ROOM_MAX_LENGTH = 20

export const roomNameValidation = (values: string, roomErrors: { error?: string; name?: string } | null) => {
  // TODO расширить регэкспу для широкого круга языков
  const requiredLetters = new RegExp('[A-Za-z0-9-Яа-яЁё]')
  const hasRequiredLetters = requiredLetters[Symbol.match](values)

  const hasMaxlength: boolean = values?.length > ROOM_MAX_LENGTH

  if (values && !hasRequiredLetters) {
    return { error: 'Must contain at least one number or letter' }
  }

  if (hasMaxlength) {
    return { error: 'Max lenght 20 caracters' }
  }

  if (roomErrors?.name === values) {
    return { error: 'Room already exists' }
  }

  return null
}
