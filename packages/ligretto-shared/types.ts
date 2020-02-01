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
  a = 'a',
  b = 'b',
  c = 'c',
  d = 'd',
  t0 = 't0',
  t1 = 't1',
  t2 = 't2',
  t3 = 't3',
  t4 = 't4',
  t5 = 't5',
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

export interface BasePlayer {
  user: string
}

export interface PlayerInGame extends BasePlayer {
  color: CardColors
  cards: Card[]
  ligrettoDeck: CardsDeck
  stackOpenDeck: CardsDeck
  stackDeck: CardsDeck
}

export type Player = BasePlayer | PlayerInGame

export interface Game {
  id: string
  name: string
  players: {
    [player: string]: PlayerInGame
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
