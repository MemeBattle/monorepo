import { Game } from '@memebattle/ligretto-shared'
import { User } from '../types/user'

export interface Storage {
  games: Record<string, Game | undefined>
  users: Record<string, User | undefined>
}
