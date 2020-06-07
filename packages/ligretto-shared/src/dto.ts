import { Room, Game, PlayerStatus, Player } from './types'

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
  playerId: Player['socketId']
}

export interface CreateRoomSuccess {
  game: Game
  playerId: Player['socketId']
}

export type GameState = Game

export interface StartGame {
  gameId: Game['id']
}

export interface PlayerStatusInGame {
  gameId: Game['id']
  status: PlayerStatus
}
