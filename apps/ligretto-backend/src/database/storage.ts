import { Game } from '@memebattle/ligretto-shared'
import { User } from '../types/user'

export interface Storage {
  games: {
    [id: string]: Game
  }
  users: {
    [id: string]: User
  }
}
