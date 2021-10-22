import type { CreateRoomError } from '@memebattle/ligretto-shared/src/dto'

const ROOM_MAX_LENGTH = 20

export const roomNameValidation = (values: string, roomErrors: CreateRoomError | null) => {
  const requiredLetters = /[\p{Alpha}\p{M}\p{Nd}\p{Pc}\p{Join_C}]/gu
  const hasRequiredLetters = requiredLetters[Symbol.match](values)

  const hasMaxlength: boolean = values?.length > ROOM_MAX_LENGTH

  if (values && !hasRequiredLetters) {
    return { error: 'Must contain at least one number or letter' }
  }

  if (hasMaxlength) {
    return { error: 'Max length 20 characters' }
  }

  if (roomErrors?.name === values) {
    return { error: 'Room already exists' }
  }

  return null
}
