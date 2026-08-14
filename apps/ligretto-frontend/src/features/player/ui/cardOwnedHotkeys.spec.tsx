// @vitest-environment jsdom

import { CardColors } from '@memebattle/ligretto-shared'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { CardFocusProvider, useCardFocus } from '#features/cardFocus'
import { tapCardAction, tapLigrettoDeckCardAction, tapStackDeckCardAction, tapStackOpenDeckCardAction } from '#ducks/game'
import { PlayerRowCardsContainer } from './PlayerRowCardsContainer/PlayerRowCardsContainer'
import { PlayerCardsStack } from './PlayerCardsStack/PlayerCardsStack'
import { LigrettoDeckContainer } from './LigrettoDeckContainer'

const mocks = vi.hoisted(() => ({
  dispatch: vi.fn(),
  isDndEnabled: true,
  rowCards: [] as ({ color: CardColors; value: number } | undefined)[] | undefined,
  stackCards: [] as { color: CardColors; value: number }[] | undefined,
  openCards: [] as { color: CardColors; value: number }[] | undefined,
  ligrettoCards: [] as { color: CardColors; value: number }[] | undefined,
}))

vi.mock('react-redux', async importActual => ({
  ...(await importActual<typeof import('react-redux')>()),
  useDispatch: () => mocks.dispatch,
  useSelector: (selector: (state: unknown) => unknown) => selector({}),
}))

vi.mock('#ducks/game', async importActual => ({
  ...(await importActual<typeof import('#ducks/game')>()),
  isDndEnabledSelector: () => mocks.isDndEnabled,
  playerCardsSelector: () => mocks.rowCards,
  playerStackDeckCardsSelector: () => mocks.stackCards,
  playerStackDeckHiddenSelector: () => false,
  playerStackOpenDeckCardsSelector: () => mocks.openCards,
  playerLigrettoDeckCardsSelector: () => mocks.ligrettoCards,
  playerLigrettoDeckHiddenSelector: () => false,
}))

const card = (value: number) => ({ color: CardColors.red, value })
const press = (key: string, code: string) => fireEvent.keyDown(document.body, { key, code })
const activatePointer = (element: HTMLElement) => {
  fireEvent.mouseDown(element)
  fireEvent.click(element)
}

const FocusState = () => {
  const { focusedCard } = useCardFocus()
  return <output data-testid="focus-state">{focusedCard?.type === 'row' ? `row.${focusedCard.index}` : (focusedCard?.type ?? 'none')}</output>
}

beforeEach(() => {
  mocks.dispatch.mockClear()
  mocks.isDndEnabled = true
  mocks.rowCards = []
  mocks.stackCards = []
  mocks.openCards = []
  mocks.ligrettoCards = []
})
afterEach(cleanup)

describe('card-owned hotkeys', () => {
  it('routes a rendered row key through the same focus behavior as pointer activation', () => {
    mocks.rowCards = [card(2)]
    render(
      <CardFocusProvider enabled>
        <PlayerRowCardsContainer />
        <FocusState />
      </CardFocusProvider>,
    )

    press('q', 'KeyQ')
    expect(screen.getByTestId('focus-state').textContent).toBe('row.0')
    press('q', 'KeyQ')
    expect(screen.getByTestId('focus-state').textContent).toBe('none')
    activatePointer(screen.getByRole('button'))
    expect(screen.getByTestId('focus-state').textContent).toBe('row.0')
    activatePointer(screen.getByRole('button'))
    expect(screen.getByTestId('focus-state').textContent).toBe('none')
    expect(mocks.dispatch).not.toHaveBeenCalled()
  })

  it('dispatches a value-1 row card exactly once from its key', () => {
    mocks.rowCards = [card(1)]
    render(
      <CardFocusProvider enabled>
        <PlayerRowCardsContainer />
      </CardFocusProvider>,
    )

    press('q', 'KeyQ')

    expect(mocks.dispatch).toHaveBeenCalledOnce()
    expect(mocks.dispatch).toHaveBeenCalledWith(tapCardAction({ cardIndex: 0 }))
  })

  it('does not handle a missing or disabled row card key', () => {
    mocks.rowCards = [undefined]
    const view = render(
      <CardFocusProvider enabled>
        <PlayerRowCardsContainer />
      </CardFocusProvider>,
    )
    press('q', 'KeyQ')
    mocks.isDndEnabled = false
    mocks.rowCards = [card(2)]
    view.rerender(
      <CardFocusProvider enabled={false}>
        <PlayerRowCardsContainer />
      </CardFocusProvider>,
    )
    press('q', 'KeyQ')

    expect(mocks.dispatch).not.toHaveBeenCalled()
  })

  it('routes X and pointer activation through open-card focus toggle behavior', () => {
    mocks.stackCards = []
    mocks.openCards = [card(2)]
    render(
      <CardFocusProvider enabled>
        <PlayerCardsStack />
        <FocusState />
      </CardFocusProvider>,
    )
    press('x', 'KeyX')
    expect(screen.getByTestId('focus-state').textContent).toBe('open-stack')
    press('x', 'KeyX')
    expect(screen.getByTestId('focus-state').textContent).toBe('none')
    const openCard = screen.getAllByRole('button').find(button => button.hasAttribute('data-card-focus-element'))!
    activatePointer(openCard)
    expect(screen.getByTestId('focus-state').textContent).toBe('open-stack')
    activatePointer(openCard)
    expect(screen.getByTestId('focus-state').textContent).toBe('none')
    expect(mocks.dispatch).not.toHaveBeenCalled()
  })

  it('dispatches a value-1 open card exactly once from X', () => {
    mocks.stackCards = []
    mocks.openCards = [card(1)]
    render(
      <CardFocusProvider enabled>
        <PlayerCardsStack />
      </CardFocusProvider>,
    )
    press('x', 'KeyX')
    expect(mocks.dispatch).toHaveBeenCalledOnce()
    expect(mocks.dispatch).toHaveBeenCalledWith(tapStackOpenDeckCardAction())
  })

  it('does not show or handle X when the open card is missing or controls are disabled', () => {
    mocks.stackCards = []
    const view = render(
      <CardFocusProvider enabled>
        <PlayerCardsStack />
      </CardFocusProvider>,
    )
    expect(screen.queryByText('X')).toBeNull()
    press('x', 'KeyX')

    mocks.openCards = [card(2)]
    mocks.isDndEnabled = false
    view.rerender(
      <CardFocusProvider enabled={false}>
        <PlayerCardsStack />
      </CardFocusProvider>,
    )
    press('x', 'KeyX')
    expect(mocks.dispatch).not.toHaveBeenCalled()
  })

  it('clears focused cards and dispatches the stack command once for keyboard and pointer activation', () => {
    mocks.stackCards = [card(3)]
    mocks.openCards = [card(2)]
    const view = render(
      <CardFocusProvider enabled>
        <PlayerCardsStack />
        <FocusState />
      </CardFocusProvider>,
    )
    press('x', 'KeyX')
    expect(screen.getByTestId('focus-state').textContent).toBe('open-stack')

    press(' ', 'Space')
    expect(screen.getByTestId('focus-state').textContent).toBe('none')
    expect(mocks.dispatch).toHaveBeenCalledOnce()
    expect(mocks.dispatch).toHaveBeenCalledWith(tapStackDeckCardAction())

    mocks.dispatch.mockClear()
    press('x', 'KeyX')
    expect(screen.getByTestId('focus-state').textContent).toBe('open-stack')
    activatePointer(screen.getByText('3').closest('button')!)
    expect(screen.getByTestId('focus-state').textContent).toBe('none')
    expect(mocks.dispatch).toHaveBeenCalledOnce()
    expect(mocks.dispatch).toHaveBeenCalledWith(tapStackDeckCardAction())

    mocks.dispatch.mockClear()
    mocks.isDndEnabled = false
    view.rerender(
      <CardFocusProvider enabled={false}>
        <PlayerCardsStack />
        <FocusState />
      </CardFocusProvider>,
    )
    press(' ', 'Space')
    expect(mocks.dispatch).not.toHaveBeenCalled()
  })

  it('does not handle Space when the stack and open decks are empty', () => {
    mocks.stackCards = []
    mocks.openCards = []
    render(
      <CardFocusProvider enabled>
        <PlayerCardsStack />
      </CardFocusProvider>,
    )

    expect(screen.queryByText('SPACE')).toBeNull()
    press(' ', 'Space')

    expect(mocks.dispatch).not.toHaveBeenCalled()
  })

  it('dispatches the reshuffle command from Space when only an open-stack card exists', () => {
    mocks.stackCards = []
    mocks.openCards = [card(2)]
    render(
      <CardFocusProvider enabled>
        <PlayerCardsStack />
      </CardFocusProvider>,
    )

    press(' ', 'Space')

    expect(mocks.dispatch).toHaveBeenCalledOnce()
    expect(mocks.dispatch).toHaveBeenCalledWith(tapStackDeckCardAction())
  })

  it('does not handle L when the Ligretto deck is empty', () => {
    mocks.ligrettoCards = []
    render(<LigrettoDeckContainer />)

    expect(screen.queryByText('L')).toBeNull()
    press('l', 'KeyL')

    expect(mocks.dispatch).not.toHaveBeenCalled()
  })

  it('does not handle L when controls are disabled', () => {
    mocks.isDndEnabled = false
    mocks.ligrettoCards = [card(4)]
    render(<LigrettoDeckContainer />)

    expect(screen.queryByText('L')).toBeNull()
    press('l', 'KeyL')

    expect(mocks.dispatch).not.toHaveBeenCalled()
  })

  it('dispatches the Ligretto command exactly once from L only while mounted and enabled', () => {
    mocks.ligrettoCards = [card(4)]
    const view = render(<LigrettoDeckContainer />)
    press('l', 'KeyL')
    expect(mocks.dispatch).toHaveBeenCalledOnce()
    expect(mocks.dispatch).toHaveBeenCalledWith(tapLigrettoDeckCardAction())

    mocks.dispatch.mockClear()
    mocks.ligrettoCards = undefined
    view.rerender(<LigrettoDeckContainer />)
    press('l', 'KeyL')
    expect(mocks.dispatch).not.toHaveBeenCalled()
  })
})
