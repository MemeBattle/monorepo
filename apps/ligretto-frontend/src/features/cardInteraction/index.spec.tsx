// @vitest-environment jsdom

import type { PropsWithChildren } from 'react'
import { configureStore } from '@reduxjs/toolkit'
import { CardColors, GameStatus } from '@memebattle/ligretto-shared'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Provider } from 'react-redux'

import { CardInteractionProvider, useCardInteraction } from './index'
import { rootReducer } from '#app/store/rootReducer'
import { initialState as gameInitialState } from '#ducks/game/slice'
import { Playground } from '#features/playground/ui/Playground'

afterEach(cleanup)

const testStore = configureStore({
  reducer: rootReducer,
  preloadedState: {
    game: {
      ...gameInitialState,
      game: { ...gameInitialState.game, status: GameStatus.InGame },
    },
  },
})

const TestProvider = ({ children, enabled = true }: PropsWithChildren<{ enabled?: boolean }>) => (
  <Provider store={testStore}>
    <CardInteractionProvider enabled={enabled}>{children}</CardInteractionProvider>
  </Provider>
)

const RowCard = ({ value = 2 }: { value?: number }) => {
  const { isActive, toggleActiveTarget } = useCardInteraction(
    {
      type: 'row',
      index: 0,
    },
    [CardColors.red, value],
  )

  return (
    <button data-card-interaction-element onClick={toggleActiveTarget}>
      {isActive ? 'focused' : 'idle'}
    </button>
  )
}

const FocusController = () => {
  const focus = useCardInteraction()

  return (
    <>
      <output>{focus.activeTarget?.type === 'row' ? `row.${focus.activeTarget.index}` : (focus.activeTarget?.type ?? 'none')}</output>
      <output data-testid="integration-api">{Object.keys(focus).sort().join(',')}</output>
    </>
  )
}

const TransferOnCleanup = ({ showFirst }: { showFirst: boolean }) => (
  <>
    {showFirst ? <RowCard /> : null}
    <OpenStackCard />
  </>
)

const TargetedApi = () => {
  const focus = useCardInteraction({ type: 'row', index: 1 }, [CardColors.green, 4])
  return <output data-testid="targeted-api">{Object.keys(focus).sort().join(',')}</output>
}

const OpenStackCard = () => {
  const { isActive, toggleActiveTarget } = useCardInteraction(
    {
      type: 'open-stack',
    },
    [CardColors.blue, 3],
  )

  return (
    <button data-card-interaction-element onClick={toggleActiveTarget}>
      {isActive ? 'open-focused' : 'open-idle'}
    </button>
  )
}

describe('CardInteractionProvider', () => {
  it('exposes only the operations owned by each public hook overload', () => {
    render(
      <TestProvider>
        <FocusController />
        <TargetedApi />
      </TestProvider>,
    )

    expect(screen.getByTestId('integration-api').textContent).toBe('activeTarget,clearActiveTarget')
    expect(screen.getByTestId('targeted-api').textContent).toBe('isActive,isDimmed,toggleActiveTarget')
  })

  it('toggles a card focus through the public hook', () => {
    render(
      <TestProvider>
        <RowCard />
      </TestProvider>,
    )

    const card = screen.getByRole('button')
    expect(card.textContent).toBe('idle')
    fireEvent.click(card)
    expect(card.textContent).toBe('focused')
    fireEvent.click(card)
    expect(card.textContent).toBe('idle')
  })

  it('clears focus with Escape and prevents the browser default', () => {
    render(
      <TestProvider>
        <RowCard />
      </TestProvider>,
    )
    fireEvent.click(screen.getByText('idle'))

    const wasNotPrevented = fireEvent.keyDown(document.body, { key: 'Escape', code: 'Escape' })

    expect(screen.getByText('idle')).toBeTruthy()
    expect(wasNotPrevented).toBe(false)
  })

  it('transfers focus without treating another card as an outside click', () => {
    render(
      <TestProvider>
        <RowCard />
        <OpenStackCard />
      </TestProvider>,
    )

    fireEvent.click(screen.getByText('idle'))
    fireEvent.click(screen.getByText('open-idle'))
    expect(screen.getByText('idle')).toBeTruthy()
    expect(screen.getByText('open-focused')).toBeTruthy()
  })

  it('clears focus after a click outside every card', () => {
    render(
      <TestProvider>
        <RowCard />
        <div>outside</div>
      </TestProvider>,
    )

    fireEvent.click(screen.getByText('idle'))
    fireEvent.click(screen.getByText('outside'))
    expect(screen.getByText('idle')).toBeTruthy()
  })

  it('clears focus after clicking a card that is not focusable', () => {
    render(
      <TestProvider>
        <RowCard />
        <button>closed stack</button>
      </TestProvider>,
    )

    fireEvent.click(screen.getByText('idle'))
    fireEvent.click(screen.getByText('closed stack'))
    expect(screen.getByText('idle')).toBeTruthy()
  })

  it('keeps focus when the marked card element is clicked', () => {
    render(
      <TestProvider>
        <RowCard />
      </TestProvider>,
    )

    const card = screen.getByRole('button')
    expect(card.matches('[data-card-interaction-element]')).toBe(true)
    fireEvent.click(card)
    expect(screen.getByText('focused')).toBeTruthy()
  })

  it('keeps focus when a playground deck is clicked', () => {
    const view = render(
      <TestProvider>
        <RowCard />
        <Playground cardsDecks={Array.from({ length: 12 }, () => null)} onDeckClick={() => undefined} />
      </TestProvider>,
    )

    fireEvent.click(screen.getByText('idle'))
    const playgroundDeck = view.container.querySelector('[data-test-id="Playground-Deck-0"]')
    expect(playgroundDeck).toBeTruthy()
    fireEvent.click(playgroundDeck!)
    expect(screen.getByText('focused')).toBeTruthy()
  })

  it('clears focus when the focused card identity changes', () => {
    const view = render(
      <TestProvider>
        <RowCard />
      </TestProvider>,
    )

    fireEvent.click(screen.getByText('idle'))
    view.rerender(
      <TestProvider>
        <RowCard value={3} />
      </TestProvider>,
    )
    expect(screen.getByText('idle')).toBeTruthy()
  })

  it('does not allow pointer focus while disabled', () => {
    render(
      <TestProvider enabled={false}>
        <RowCard />
      </TestProvider>,
    )

    fireEvent.click(screen.getByText('idle'))
    expect(screen.getByText('idle')).toBeTruthy()
  })

  it('does not let stale unmount cleanup clear focus transferred to another target', () => {
    const view = render(
      <TestProvider>
        <TransferOnCleanup showFirst />
      </TestProvider>,
    )
    fireEvent.click(screen.getByText('idle'))
    fireEvent.click(screen.getByText('open-idle'))

    view.rerender(
      <TestProvider>
        <TransferOnCleanup showFirst={false} />
      </TestProvider>,
    )

    expect(screen.getByText('open-focused')).toBeTruthy()
  })

  it('clears focus when the focused card unmounts', () => {
    const view = render(
      <TestProvider>
        <RowCard />
        <FocusController />
      </TestProvider>,
    )

    fireEvent.click(screen.getByText('idle'))
    expect(screen.getByText('row.0')).toBeTruthy()
    view.rerender(
      <TestProvider>
        <FocusController />
      </TestProvider>,
    )
    expect(screen.getByText('none')).toBeTruthy()
  })
})
