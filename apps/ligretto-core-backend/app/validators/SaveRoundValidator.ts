import vine from '@vinejs/vine'

export const saveRoundValidator = vine.compile(
  vine.object({
    results: vine.array(vine.object({ playerId: vine.string(), score: vine.number() })),
  }),
)
