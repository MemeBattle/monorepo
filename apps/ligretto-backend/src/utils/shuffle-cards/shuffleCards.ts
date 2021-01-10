import type { Card } from '@memebattle/ligretto-shared'
import { shuffle } from 'lodash'

/**
 * Return a new array with shuffled cards
 */
export const shuffleCards = (cards: Card[]): Card[] => shuffle(cards)
