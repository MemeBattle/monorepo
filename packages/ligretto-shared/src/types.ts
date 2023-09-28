export enum CardColors {
  empty = 'empty',
  red = 'red',
  green = 'green',
  blue = 'blue',
  yellow = 'yellow',
}

export enum OpponentPositions {
  Left = 'Left',
  Right = 'Right',
  Top = 'Top',
}

// TODO: Fix required fields
export interface Card {
  color?: CardColors
  value: number
  hidden?: boolean
  playerId?: string
}

export interface Room {
  uuid: string
  name: string
  playersCount: number
  playersMaxCount: number
}

export interface Playground {
  decks: Array<CardsDeck | null>
  droppedDecks: CardsDeck[]
}

export interface Player {
  id: string
  status: PlayerStatus
  cards: (Card | null)[]
  ligrettoDeck: CardsDeck
  stackOpenDeck: CardsDeck
  stackDeck: CardsDeck
  isHost: boolean
}

export interface Spectator {
  id: string
}

export enum GameStatus {
  New = 'New',
  Starting = 'Starting',
  InGame = 'InGame',
  Pause = 'Pause',
  RoundFinished = 'RoundFinished',
}

export enum CreateRoomErrorCode {
  AlreadyExist = 'AlreadyExist',
}

export enum PlayerStatus {
  DontReadyToPlay = 'DontReadyToPlay',
  ReadyToPlay = 'ReadyToPlay',
  InGame = 'InGame',
}

export interface Game {
  id: UUID
  name: string
  status: GameStatus
  players: Record<UUID, Player | undefined>
  spectators: Record<UUID, Spectator | undefined>
  playground: Playground
  config: {
    startingDelayInSec: number
    playersMaxCount: number
    dndEnabled: boolean
    maxCardsOnTable: number
  }
}

export interface CardsDeck {
  isHidden: boolean
  cards: Card[]
}

export type RoundInfo = {
  results: Record<
    Player['id'],
    {
      roundScore: number
    }
  >
}

export type GameResults = Record<
  Player['id'],
  {
    roundScore: number
    gameScore: number
  }
>

export type UUID = string
