import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { configureStore, type UnknownAction } from '@reduxjs/toolkit'
import { Provider, useSelector } from 'react-redux'
import { CardColors, putCardAction, putCardFromStackOpenDeck, type CardsDeck } from '@memebattle/ligretto-shared'

import { gameReducer, initialState as gameInitialState } from '#ducks/game'
import { Card, CardPlace } from '#entities/card'
import { CardFocusProvider } from '#features/cardFocus'
import { CardPlacementProvider, DraggableCard, PlaygroundDeckDropTarget } from '#features/cardPlacement'

const params = new URLSearchParams(window.location.search)
const sourceValue = Number(params.get('value') ?? 2)
const sourceType = params.get('source') === 'open-stack' ? 'open-stack' : 'row'
const valid = params.get('valid') !== 'false'

const observedReducer = (state = '', action: UnknownAction) => {
  if (putCardAction.match(action) || putCardFromStackOpenDeck.match(action)) {
    return JSON.stringify(action.payload)
  }
  return state
}

const store = configureStore({
  reducer: { game: gameReducer, observed: observedReducer },
  preloadedState: {
    game: { ...gameInitialState, game: { ...gameInitialState.game, id: 'game' } },
    observed: '',
  },
})

const Observer = () => <output data-test-id="placement-action">{useSelector((state: ReturnType<typeof store.getState>) => state.observed)}</output>

const Harness = () => {
  const [clicks, setClicks] = useState(0)
  const target = sourceType === 'row' ? ({ type: 'row', index: 1 } as const) : ({ type: 'open-stack' } as const)
  const deck: CardsDeck | null =
    sourceValue === 1 ? null : { cards: [{ color: valid ? CardColors.red : CardColors.blue, value: 1 }], isHidden: false }

  return (
    <Provider store={store}>
      <CardFocusProvider enabled>
        <CardPlacementProvider enabled>
          <div style={{ display: 'flex', gap: '8rem', padding: '3rem' }}>
            <DraggableCard target={target} card={{ color: CardColors.red, value: sourceValue }}>
              <Card data-test-id="drag-source" color={CardColors.red} value={sourceValue} onClick={() => setClicks(value => value + 1)} />
            </DraggableCard>
            <PlaygroundDeckDropTarget deckIndex={4} deck={deck}>
              <CardPlace dataTestId="drop-target" size="large">
                {deck?.cards[0] ? <Card size="large" {...deck.cards[0]} /> : null}
              </CardPlace>
            </PlaygroundDeckDropTarget>
          </div>
          <output data-test-id="click-count">{clicks}</output>
          <Observer />
        </CardPlacementProvider>
      </CardFocusProvider>
    </Provider>
  )
}

createRoot(document.getElementById('root')!).render(<Harness />)
