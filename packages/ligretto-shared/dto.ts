import { CardPositions, CardColors } from './types'

export class TapCard {
  cardPosition!: CardPositions
  newPosition?: CardPositions
}

export class ChangeCard {
  cardPosition!: CardPositions
  value!: 'string'
  color!: CardColors
}

export class ChangeCards {
  cards!: ChangeCard[]
}
