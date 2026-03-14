import vine from '@vinejs/vine'

export const usersListValidator = vine.compile(vine.object({ ids: vine.array(vine.string()) }))
