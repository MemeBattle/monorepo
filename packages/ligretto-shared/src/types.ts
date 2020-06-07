export enum CardColors {
  empty = 'empty',
  red = 'red',
  green = 'green',
  blue = 'blue',
  yellow = 'yellow',
}

export enum CardPositions {
  q = 'q',
  w = 'w',
  e = 'e',
  r = 'r',
  t = 't',
  y = 'y',
  l0 = 'l0',
  l1 = 'l1',
  l2 = 'l2',
  l3 = 'l3',
  r0 = 'r0',
  r1 = 'r1',
  r2 = 'r2',
  r3 = 'r3',
  o0 = 'o0',
  o1 = 'o1',
  o2 = 'o2',
  o3 = 'o3',
  t0 = 't0',
  t1 = 't1',
  t2 = 't2',
  t3 = 't3',
  t4 = 't4',
  t5 = 't5',
  t6 = 't6',
  t7 = 't7',
  t8 = 't8',
  t9 = 't9',
  t10 = 't10',
  t11 = 't11',
}

export enum OpponentPositions {
  Left = 'Left',
  Right = 'Right',
  Top = 'Top',
}

export interface Card {
  color?: CardColors
  value?: number
  position?: CardPositions
  disabled?: boolean
  hidden?: boolean
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
  socketId: string
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
    [socketId: string]: Player
  }
  playground: Playground
  config: {
    cardsCount: number
    playersMaxCount: number
  }
}

export interface CardsDeck {
  isHidden: boolean
  cards: Card[]
}
