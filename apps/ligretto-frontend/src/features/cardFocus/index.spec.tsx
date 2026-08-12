// @vitest-environment jsdom

import type { PropsWithChildren } from 'react'
import { configureStore } from '@reduxjs/toolkit'
import { CardColors, GameStatus } from '@memebattle/ligretto-shared'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Provider } from 'react-redux'

import { CardFocusProvider, useCardFocus } from './index'
import { rootReducer } from '#app/store/rootReducer'
import { initialState as gameInitialState, tapStackDeckCardAction } from '#ducks/game/slice'

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
  const { isFocused, toggleFocus } = useCardFocus({
    target: { type: 'row', index: 0 },
    identity: { color: CardColors.red, value },
  })

  return (
    <button data-card-focus-element onClick={toggleFocus}>
      {isFocused ? 'focused' : 'idle'}
    </button>
  )
}

const OpenStackCard = () => {
  const { isFocused, toggleFocus } = useCardFocus({
    target: { type: 'stack-open' },
    identity: { color: CardColors.blue, value: 3 },
  })

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

  it('preserves focus after a click on marked badge content', () => {
    render(
      <TestProvider>
        <RowCard />
        <span data-card-focus-element>
          <span>badge</span>
        </span>
      </TestProvider>,
    )

    fireEvent.click(screen.getByText('idle'))
    fireEvent.click(screen.getByText('badge'))
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

  it('clears focus with Escape without dispatching a game command', () => {
    const dispatch = vi.spyOn(testStore, 'dispatch')
    render(
      <TestProvider>
        <RowCard />
      </TestProvider>,
    )

    fireEvent.click(screen.getByText('idle'))
    dispatch.mockClear()
    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' })

    expect(screen.getByText('idle')).toBeTruthy()
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('clears focus and dispatches one stack rotation with Space', () => {
    const dispatch = vi.spyOn(testStore, 'dispatch')
    render(
      <TestProvider>
        <RowCard />
      </TestProvider>,
    )

    fireEvent.click(screen.getByText('idle'))
    dispatch.mockClear()
    fireEvent.keyDown(document, { key: ' ', code: 'Space' })

    expect(screen.getByText('idle')).toBeTruthy()
    expect(dispatch.mock.calls.filter(([action]) => action.type === tapStackDeckCardAction.type)).toHaveLength(1)
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
})
