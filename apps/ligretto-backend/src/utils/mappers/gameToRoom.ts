import type { Room, Game } from '@memebattle/ligretto-shared'

export const gameToRoom = (game: Game): Room => ({
  uuid: game.id,
  name: game.name,
  playersCount: Object.keys(game.players).length,
  playersMaxCount: game.config.playersMaxCount,
})
