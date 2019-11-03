export enum CardColors {
  empty = 'empty',
  red = 'red',
  green = 'green',
  blue = 'blue',
  yellow = 'yellow',
}

export interface Card {
  color: CardColors
  value: number
  player: string,
}
