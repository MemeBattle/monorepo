import { UserProfile } from './entities/user'
import { Card, CardPositions } from 'types/entities/card-model'
import { Room } from '@memebattle/ligretto-shared'
import { RouterState } from 'connected-react-router'

export interface User {
  profile: UserProfile
}

export type Cards = {
  [key in CardPositions]: Card
}

export type Rooms = {
  byId: {
    [uuid: string]: Room
  }
  ids: string[]
  isLoading: boolean
  search: string
}

export interface All {
  user: User
  cards: Cards
  rooms: Rooms
  router: RouterState
}
