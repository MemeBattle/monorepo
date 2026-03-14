import vine from '@vinejs/vine'

export const getMeValidator = vine.compile(vine.object({ token: vine.string().optional() }))
