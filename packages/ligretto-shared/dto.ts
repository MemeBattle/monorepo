import { CardPositions, CardColors } from '../../apps/ligretto-recovery/src/types/entities/card-model'

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
