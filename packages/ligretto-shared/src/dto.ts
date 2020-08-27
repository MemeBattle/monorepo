import { Room, Game, PlayerStatus, Player, GameResults } from './types'

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
  playerId: Player['id']
}

export interface CreateRoomSuccess {
  game: Game
  playerId: Player['id']
}

export type GameState = Game

export interface StartGame {
  gameId: Game['id']
}

export interface PlayerStatusInGame {
  gameId: Game['id']
  status: PlayerStatus
}

export interface PutCard {
  cardIndex: number
  gameId: Game['id']
}

export interface TakeCardFromLigrettoDeck {
  gameId: Game['id']
}

export interface PutCardFromStackOpenDeck {
  gameId: Game['id']
}

export interface TakeCardFromStackDeck {
  gameId: Game['id']
}

export interface TechConnectToGame {
  gameId: Game['id']
}

export type GameResultsDTO = GameResults
