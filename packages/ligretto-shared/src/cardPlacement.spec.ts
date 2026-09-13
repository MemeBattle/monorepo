import { describe, expect, it } from 'vitest'

import { CardColors, type Card, type CardsDeck } from './types'
import { canPlaceCardOnDeck } from './cardPlacement'

const card = (value: number, color = CardColors.red): Card => ({ value, color })
const deck = (...cards: Card[]): CardsDeck => ({ cards, isHidden: false })

describe('canPlaceCardOnDeck', () => {
  it('allows a value-1 card on an empty deck but not a missing deck', () => {
    expect(canPlaceCardOnDeck(card(1), null)).toBe(true)
    expect(canPlaceCardOnDeck(card(1), deck())).toBe(true)
    expect(canPlaceCardOnDeck(card(1), undefined)).toBe(false)
  })

  it('rejects a non-value-1 card on an empty or missing deck', () => {
    expect(canPlaceCardOnDeck(card(2), null)).toBe(false)
    expect(canPlaceCardOnDeck(card(2), undefined)).toBe(false)
  })

  it('allows only the next value of the same color', () => {
    expect(canPlaceCardOnDeck(card(3), deck(card(1), card(2)))).toBe(true)
    expect(canPlaceCardOnDeck(card(3, CardColors.blue), deck(card(2)))).toBe(false)
    expect(canPlaceCardOnDeck(card(4), deck(card(2)))).toBe(false)
    expect(canPlaceCardOnDeck(card(2), deck(card(2)))).toBe(false)
  })
})
