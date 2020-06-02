import { CardPositions, Room, Game, PlayerStatus, CardColors } from './types'

export interface TapCard {
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
  playerColor: CardColors
}

export interface CreateRoomSuccess {
  game: Game
  playerColor: CardColors
}

export type GameState = Game

export interface StartGame {
  gameId: Game['id']
}

export interface PlayerStatusInGame {
  gameId: Game['id']
  status: PlayerStatus
}
