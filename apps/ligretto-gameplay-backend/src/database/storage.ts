import type { Game, GameResults } from '@memebattle/ligretto-shared'
import type { User } from '../types/user'

export interface Storage {
  games: Record<string, Game>
  users: Record<User['id'], User | undefined>
  /**
   * Last finished round per game. Kept so reconnecting players can be shown
   * the current scores: the endRound broadcast is ephemeral and a rejoining
   * client starts from a clean slate.
   */
  roundResults: Record<string, GameResults | undefined>
  /**
   * Game id to the `roundId` whose save to ligretto-core is being awaited. Set by the finish's claim, deleted when
   * the save's outcome is applied or when the room is deleted. A finish claims `RoundFinished` before the save, so
   * this entry is what tells a save in flight from an intermission.
   */
  roundSavesInFlight: Record<string, string | undefined>
}
