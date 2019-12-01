import { Room } from '@memebattle/ligretto-shared'
import { Game } from '../../types/game'

export const gameToRoom = (game: Game): Room => ({
  uuid: game.id,
  name: game.name,
  playersCount: Object.keys(game.players).length,
  playersMaxCount: game.config.playersMaxCount,
})
