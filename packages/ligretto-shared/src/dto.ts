import type { Room, Game, PlayerStatus, Player, GameResults, CreateRoomErrorCode } from './types'

export interface GetRoomsFinish {
  rooms: Room[]
}

export interface UpdateRooms {
  rooms: Room[]
}

export interface RemoveRoom {
  uuid: Room['uuid']
}

export interface CreateGame {
  name: string
  config?: Partial<Game['config']>
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

export interface CreateRoomError {
  errorCode: CreateRoomErrorCode
  name: string
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
  gameId: Game['id']
  cardIndex: number
  playgroundDeckIndex?: number
}

export interface TakeCardFromLigrettoDeck {
  gameId: Game['id']
}

export interface PutCardFromStackOpenDeck {
  gameId: Game['id']
  playgroundDeckIndex?: number
}

export interface TakeCardFromStackDeck {
  gameId: Game['id']
}

export interface TechConnectToGame {
  gameId: Game['id']
}

export type GameResultsDTO = GameResults

export interface AddBotDTO {
  gameId: Game['id']
}

export interface RemoveBotDTO {
  gameId: Game['id']
  botId: Player['id']
}

export interface UserJoinToRoomDTO {
  userId: Player['id']
}
