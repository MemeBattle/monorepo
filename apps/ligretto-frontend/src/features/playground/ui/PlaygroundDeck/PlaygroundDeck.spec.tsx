// @vitest-environment jsdom

import { configureStore } from '@reduxjs/toolkit'
import { CardColors, GameStatus, type Card } from '@memebattle/ligretto-shared'
import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Provider } from 'react-redux'

import { PlaygroundDeck } from './PlaygroundDeck'
import { rootReducer } from '#app/store/rootReducer'
import { initialState as gameInitialState } from '#ducks/game/slice'
import { CardInteractionProvider } from '#features/cardInteraction'

const testStore = configureStore({
  reducer: rootReducer,
  preloadedState: {
    game: {
      ...gameInitialState,
      game: { ...gameInitialState.game, status: GameStatus.InGame },
    },
  },
})

const card = (value: number): Card => ({ id: `card:host:red:${value}`, value, color: CardColors.red, playerId: 'host' })

const renderDeck = (cards: Card[] | undefined) => {
  const { container } = render(
    <Provider store={testStore}>
      <CardInteractionProvider enabled>
        <PlaygroundDeck cardDeck={cards && { isHidden: false, cards }} deckIndex={0} />
      </CardInteractionProvider>
    </Provider>,
  )
  const cardButtons = [...container.querySelectorAll('button')]

  return {
    topCards: cardButtons.filter(button => !button.closest('[inert]')).map(button => button.textContent),
    cardsBelow: cardButtons.filter(button => button.closest('[inert]')).map(button => button.textContent),
  }
}

describe('PlaygroundDeck', () => {
  it('shows the last placed card on top and the one before it underneath', () => {
    expect(renderDeck([card(1), card(2), card(3), card(4)])).toEqual({ topCards: ['4'], cardsBelow: ['3'] })
  })

  it('shows a single card on top with nothing underneath', () => {
    expect(renderDeck([card(1)])).toEqual({ topCards: ['1'], cardsBelow: [] })
  })

  it.each([
    ['an empty deck', []],
    ['a missing deck', undefined],
  ])('shows no cards for %s', (_, cards) => {
    expect(renderDeck(cards)).toEqual({ topCards: [], cardsBelow: [] })
  })
})
