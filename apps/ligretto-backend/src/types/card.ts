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
  color: CardColors
  value: number
}
