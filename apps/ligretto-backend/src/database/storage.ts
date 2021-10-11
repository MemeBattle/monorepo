import type { Game } from '@memebattle/ligretto-shared'
import type { User } from '../types/user'

export interface Storage {
  games: Record<string, Game | undefined>
  users: Record<User['id'], User | undefined>
}
