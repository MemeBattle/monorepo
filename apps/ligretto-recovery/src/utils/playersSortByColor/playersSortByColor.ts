import { sortBy } from 'lodash'
import { CardColors, Player } from '@memebattle/ligretto-shared'

const orderByColor: { [color in CardColors]: number } = {
  [CardColors.empty]: 0,
  [CardColors.yellow]: 1,
  [CardColors.green]: 2,
  [CardColors.blue]: 3,
  [CardColors.red]: 4,
}

export const playersSortByColor = (players: Player[]) => sortBy(players, player => orderByColor[player.color])
