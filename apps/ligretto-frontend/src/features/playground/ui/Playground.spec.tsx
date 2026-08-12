// @vitest-environment jsdom

import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { Playground } from './Playground'

describe('Playground', () => {
  it('does not treat an empty deck as a placement target', () => {
    const onDeckClick = vi.fn()

    const { container } = render(<Playground cardsDecks={[]} onDeckClick={onDeckClick} />)
    const emptyDeck = container.firstElementChild?.firstElementChild?.firstElementChild?.firstElementChild
    expect(emptyDeck).toBeTruthy()
    fireEvent.click(emptyDeck!)

    expect(onDeckClick).not.toHaveBeenCalled()
  })
})
