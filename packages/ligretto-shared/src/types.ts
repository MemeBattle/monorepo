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
  value?: number
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
  decks: CardsDeck[]
}

export interface Player {
  id: string
  status: PlayerStatus
  cards: Card[]
  ligrettoDeck: CardsDeck
  stackOpenDeck: CardsDeck
  stackDeck: CardsDeck
  isHost: boolean
}

export enum GameStatus {
  New = 'New',
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
}

export interface Game {
  id: string
  name: string
  status: GameStatus
  players: {
    [id: string]: Player
  }
  playground: Playground
  config: {
    cardsCount: number
    playersMaxCount: number
    dndEnabled: boolean
  }
}

export interface CardsDeck {
  isHidden: boolean
  cards: Card[]
}

export type GameResults = Record<
  Player['id'],
  {
    roundScore: number
    gameScore: number
  }
>
