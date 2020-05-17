import { CardPositions, Room, Game, PlayerStatus } from './types'

export interface TapCard {
  cardPosition: CardPositions
  newPosition?: CardPositions
}

export interface SearchRooms {
  search: string
}

export interface SearchRoomsFinish {
  search: string
  rooms: Room[]
}

export interface UpdateRooms {
  rooms: Room[]
}

export interface CreateGame {
  name: string
}

export interface ConnectToRoom {
  roomUuid: string
}

export interface ConnectToRoomSuccess {
  game: Game
}

export interface CreateRoomSuccess {
  game: Game
}

export type GameState = Game

export interface PlayerStatusInGame {
  gameId: Game['id']
  status: PlayerStatus
}
