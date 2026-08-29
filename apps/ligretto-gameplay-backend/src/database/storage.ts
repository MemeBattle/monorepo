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
}
