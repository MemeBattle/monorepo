import { Card, CardColors } from '@memebattle/ligretto-shared'
import { shuffleCards } from '../shuffle-cards'

const valuesArray: number[] = [...Array(10).keys()]

/**
 * Create array with initial shuffled cards (10 x red from 1 to 10, etc)
 */
export const createInitialPlayerCards = (): Card[] =>
  shuffleCards(
    [CardColors.red, CardColors.blue, CardColors.green, CardColors.yellow].reduce(
      (cards: Card[], cardColor) => cards.concat(...valuesArray.map((value): Card => ({ value: value + 1, color: cardColor }))),
      [],
    ),
  )
