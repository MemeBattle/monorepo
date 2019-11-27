import { CardPositions, CardColors, Room } from './types'

export interface TapCard {
  cardPosition: CardPositions
  newPosition?: CardPositions
}

export interface ChangeCard {
  cardPosition: CardPositions
  value: 'string'
  color: CardColors
}

export interface ChangeCards {
  cards: ChangeCard[]
}

export interface SearchRooms {
  search: string
}

export interface SearchRoomsFinish {
  search: string
  rooms: Room[]
}

export interface CreateGame {
  name: string
  type: 'CREATE_NEW_ROOM'
}
