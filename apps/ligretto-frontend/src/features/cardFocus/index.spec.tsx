// @vitest-environment jsdom

import type { PropsWithChildren } from 'react'
import { configureStore } from '@reduxjs/toolkit'
import { CardColors, GameStatus } from '@memebattle/ligretto-shared'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Provider } from 'react-redux'

import { CardFocusProvider, useCardFocus } from './index'
import { rootReducer } from '#app/store/rootReducer'
import { initialState as gameInitialState } from '#ducks/game/slice'

afterEach(cleanup)

const testStore = configureStore({
  reducer: rootReducer,
  preloadedState: {
    game: {
      ...gameInitialState,
      game: { ...gameInitialState.game, status: GameStatus.InGame, config: { ...gameInitialState.game.config, dndEnabled: true } },
    },
  },
})

const TestProvider = ({ children, enabled = true }: PropsWithChildren<{ enabled?: boolean }>) => (
  <Provider store={testStore}>
    <CardFocusProvider enabled={enabled}>{children}</CardFocusProvider>
  </Provider>
)

const RowCard = ({ value = 2 }: { value?: number }) => {
  const { isFocused, toggleFocus } = useCardFocus(
    {
      type: 'row',
      index: 0,
    },
    [CardColors.red, value],
  )

  return (
    <button data-card-focus-element onClick={toggleFocus}>
      {isFocused ? 'focused' : 'idle'}
    </button>
  )
}

const FocusController = () => {
  const { focusedCard, toggleFocus } = useCardFocus()

  return (
    <>
      <button data-card-focus-element onClick={() => toggleFocus({ type: 'row', index: 0 })}>
        toggle row 0
      </button>
      <button data-card-focus-element onClick={() => toggleFocus({ type: 'row', index: 1 })}>
        toggle missing row
      </button>
      <output>{focusedCard?.type === 'row' ? `row.${focusedCard.index}` : (focusedCard?.type ?? 'none')}</output>
    </>
  )
}

const OpenStackCard = () => {
  const { isFocused, toggleFocus } = useCardFocus(
    {
      type: 'open-stack',
    },
    [CardColors.blue, 3],
  )

  return (
    <button data-card-focus-element onClick={toggleFocus}>
      {isFocused ? 'open-focused' : 'open-idle'}
    </button>
  )
}

describe('CardFocusProvider', () => {
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
    expect(card.matches('[data-card-focus-element]')).toBe(true)
    fireEvent.click(card)
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

  it('clears focus when toggling an unregistered target', () => {
    render(
      <TestProvider>
        <RowCard />
        <FocusController />
      </TestProvider>,
    )

    fireEvent.click(screen.getByText('toggle row 0'))
    expect(screen.getByText('row.0')).toBeTruthy()
    fireEvent.click(screen.getByText('toggle missing row'))
    expect(screen.getByText('none')).toBeTruthy()
  })

  it('clears focus when the registered card unmounts', () => {
    const view = render(
      <TestProvider>
        <RowCard />
        <FocusController />
      </TestProvider>,
    )

    fireEvent.click(screen.getByText('toggle row 0'))
    expect(screen.getByText('row.0')).toBeTruthy()
    view.rerender(
      <TestProvider>
        <FocusController />
      </TestProvider>,
    )
    expect(screen.getByText('none')).toBeTruthy()
  })
})
