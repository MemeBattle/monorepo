// @vitest-environment jsdom

import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CardColors } from '@memebattle/ligretto-shared'

import { heightByCardSize, widthByCardSize } from '#entities/card/ui/Card'
import { CardInteractionProvider } from '#features/cardInteraction'
import { Playground } from './Playground'

afterEach(cleanup)

describe('Playground', () => {
  it('renders the droppable surface inside each CardPlace', () => {
    const view = render(
      <CardInteractionProvider enabled={false}>
        <Playground cardsDecks={[{ cards: [{ color: CardColors.red, value: 1 }], isHidden: false }]} onDeckClick={vi.fn()} />
      </CardInteractionProvider>,
    )

    const cardPlace = view.container.querySelector('[data-test-id="Playground-Deck-0"]')
    const dropTarget = view.container.querySelector('[data-card-drop-target="playground.0"]')
    expect(cardPlace?.contains(dropTarget)).toBe(true)
    expect(getComputedStyle(dropTarget!).width).toBe(widthByCardSize.large)
    expect(getComputedStyle(dropTarget!).height).toBe(heightByCardSize.large)
  })

  it('calls onDeckClick when an empty deck surface is clicked', () => {
    const onDeckClick = vi.fn()
    const view = render(
      <CardInteractionProvider enabled={false}>
        <Playground cardsDecks={[null]} onDeckClick={onDeckClick} />
      </CardInteractionProvider>,
    )

    fireEvent.click(view.container.querySelector('[data-card-drop-target="playground.0"]')!)

    expect(onDeckClick).toHaveBeenCalledWith(0)
  })
})
