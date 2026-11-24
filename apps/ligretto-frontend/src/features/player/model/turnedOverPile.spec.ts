import { CardColors, type Card } from '@memebattle/ligretto-shared'
import { describe, expect, it } from 'vitest'

import { turnedOverPile } from './turnedOverPile'

const card = (value: number): Card => ({ id: `card:p:red:${value}`, color: CardColors.red, value })

describe('turnedOverPile', () => {
  it('names the old and the new top of the open stack when it is turned over into the empty stack', () => {
    const previous = { stack: [], open: [card(1), card(2), card(3), card(4), card(5)] }
    const next = { stack: [card(5), card(1)], open: [card(4), card(2), card(3)] }

    expect(turnedOverPile(previous, next)).toEqual({ leaving: card(5), arriving: card(3) })
  })

  it('names them when the whole open stack comes back, with three cards or fewer', () => {
    const previous = { stack: [], open: [card(1), card(2), card(3)] }
    const next = { stack: [], open: [card(3), card(1), card(2)] }

    expect(turnedOverPile(previous, next)).toEqual({ leaving: card(3), arriving: card(2) })
  })

  it('ignores three cards drawn from a stack that was not empty', () => {
    const previous = { stack: [card(6), card(7), card(8)], open: [card(1)] }
    const next = { stack: [], open: [card(1), card(6), card(7), card(8)] }

    expect(turnedOverPile(previous, next)).toBeUndefined()
  })

  it('ignores the top card played from the open stack while the stack is empty', () => {
    const previous = { stack: [], open: [card(1), card(2)] }
    const next = { stack: [], open: [card(1)] }

    expect(turnedOverPile(previous, next)).toBeUndefined()
  })

  it('ignores a turn that leaves the same card on top', () => {
    const previous = { stack: [], open: [card(1), card(2), card(3), card(4)] }
    const next = { stack: [card(1)], open: [card(3), card(2), card(4)] }

    expect(turnedOverPile(previous, next)).toBeUndefined()
  })

  it('ignores cards without ids, from a game created before cards had them', () => {
    const previous = { stack: [], open: [{ value: 1 }, { value: 2 }] }
    const next = { stack: [], open: [{ value: 2 }, { value: 1 }] }

    expect(turnedOverPile(previous, next)).toBeUndefined()
  })
})
