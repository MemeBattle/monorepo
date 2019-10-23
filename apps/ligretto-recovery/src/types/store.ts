import { UserProfile } from './entities/user'
import { Card, CardPositions } from 'types/entities/card-model'

export interface User {
  profile: UserProfile
}

export type Cards = {
  [key in CardPositions]: Card
}

export interface All {
  user: User
  cards: Cards
}
