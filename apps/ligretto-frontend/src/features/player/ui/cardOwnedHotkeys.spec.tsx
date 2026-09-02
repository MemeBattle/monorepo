// @vitest-environment jsdom

import { CardColors } from '@memebattle/ligretto-shared'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { CardInteractionProvider, useCardInteraction } from '#features/cardInteraction'
import { tapLigrettoDeckCardAction, tapStackDeckCardAction } from '#ducks/game'
import { PlayerRowCardsContainer } from './PlayerRowCardsContainer/PlayerRowCardsContainer'
import { PlayerCardsStack } from './PlayerCardsStack/PlayerCardsStack'
import { LigrettoDeckContainer } from './LigrettoDeckContainer'

const mocks = vi.hoisted(() => ({
  dispatch: vi.fn(),
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
  playerCardsSelector: () => mocks.rowCards,
  playerStackDeckCardsSelector: () => mocks.stackCards,
  playerStackDeckHiddenSelector: () => false,
  playerStackOpenDeckCardsSelector: () => mocks.openCards,
  playerLigrettoDeckCardsSelector: () => mocks.ligrettoCards,
  playerLigrettoDeckHiddenSelector: () => false,
}))

vi.mock('#features/cardInteraction', async importActual => ({
  ...(await importActual<typeof import('#features/cardInteraction')>()),
  useDraggableCard: () => ({}),
}))

const card = (value: number) => ({ color: CardColors.red, value })
const press = (key: string, code: string) => fireEvent.keyDown(document.body, { key, code })
const activatePointer = (element: HTMLElement) => {
  fireEvent.mouseDown(element)
  fireEvent.click(element)
}

const FocusState = () => {
  const { activeTarget } = useCardInteraction()
  return <output data-testid="focus-state">{activeTarget?.type === 'row' ? `row.${activeTarget.index}` : (activeTarget?.type ?? 'none')}</output>
}

beforeEach(() => {
  mocks.dispatch.mockClear()
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
      <CardInteractionProvider enabled>
        <PlayerRowCardsContainer />
        <FocusState />
      </CardInteractionProvider>,
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

  it('focuses a value-1 row card instead of placing it automatically', () => {
    mocks.rowCards = [card(1)]
    render(
      <CardInteractionProvider enabled>
        <PlayerRowCardsContainer />
        <FocusState />
      </CardInteractionProvider>,
    )

    press('q', 'KeyQ')

    expect(screen.getByTestId('focus-state').textContent).toBe('row.0')
    expect(mocks.dispatch).not.toHaveBeenCalled()
  })

  it('does not show or handle a missing row card key', () => {
    mocks.rowCards = [undefined]
    render(
      <CardInteractionProvider enabled>
        <PlayerRowCardsContainer />
      </CardInteractionProvider>,
    )
    expect(screen.queryByText('Q')).toBeNull()
    press('q', 'KeyQ')

    expect(mocks.dispatch).not.toHaveBeenCalled()
  })

  it('routes X and pointer activation through open-card focus toggle behavior', () => {
    mocks.stackCards = []
    mocks.openCards = [card(2)]
    render(
      <CardInteractionProvider enabled>
        <PlayerCardsStack />
        <FocusState />
      </CardInteractionProvider>,
    )
    press('x', 'KeyX')
    expect(screen.getByTestId('focus-state').textContent).toBe('open-stack')
    press('x', 'KeyX')
    expect(screen.getByTestId('focus-state').textContent).toBe('none')
    const openCard = screen.getAllByRole('button').find(button => button.hasAttribute('data-card-interaction-element'))!
    activatePointer(openCard)
    expect(screen.getByTestId('focus-state').textContent).toBe('open-stack')
    activatePointer(openCard)
    expect(screen.getByTestId('focus-state').textContent).toBe('none')
    expect(mocks.dispatch).not.toHaveBeenCalled()
  })

  it('focuses a value-1 open card instead of placing it automatically', () => {
    mocks.stackCards = []
    mocks.openCards = [card(1)]
    render(
      <CardInteractionProvider enabled>
        <PlayerCardsStack />
        <FocusState />
      </CardInteractionProvider>,
    )
    press('x', 'KeyX')
    expect(screen.getByTestId('focus-state').textContent).toBe('open-stack')
    expect(mocks.dispatch).not.toHaveBeenCalled()
  })

  it('does not show or handle X when the open card is missing', () => {
    mocks.stackCards = []
    render(
      <CardInteractionProvider enabled>
        <PlayerCardsStack />
      </CardInteractionProvider>,
    )
    expect(screen.queryByText('X')).toBeNull()
    press('x', 'KeyX')
    expect(mocks.dispatch).not.toHaveBeenCalled()
  })

  it('clears focused cards and dispatches the stack command once for keyboard and pointer activation', () => {
    mocks.stackCards = [card(3)]
    mocks.openCards = [card(2)]
    render(
      <CardInteractionProvider enabled>
        <PlayerCardsStack />
        <FocusState />
      </CardInteractionProvider>,
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
  })

  it('does not handle Space when the stack and open decks are empty', () => {
    mocks.stackCards = []
    mocks.openCards = []
    render(
      <CardInteractionProvider enabled>
        <PlayerCardsStack />
      </CardInteractionProvider>,
    )

    expect(screen.queryByText('SPACE')).toBeNull()
    press(' ', 'Space')
    activatePointer(screen.getByRole('button'))

    expect(mocks.dispatch).not.toHaveBeenCalled()
  })

  it('dispatches the reshuffle command from Space when only an open-stack card exists', () => {
    mocks.stackCards = []
    mocks.openCards = [card(2)]
    render(
      <CardInteractionProvider enabled>
        <PlayerCardsStack />
      </CardInteractionProvider>,
    )

    press(' ', 'Space')

    expect(mocks.dispatch).toHaveBeenCalledOnce()
    expect(mocks.dispatch).toHaveBeenCalledWith(tapStackDeckCardAction())
  })

  it('does not handle L when the Ligretto deck is empty', () => {
    mocks.ligrettoCards = []
    render(
      <CardInteractionProvider enabled>
        <LigrettoDeckContainer />
      </CardInteractionProvider>,
    )

    expect(screen.queryByText('L')).toBeNull()
    press('l', 'KeyL')
    activatePointer(screen.getByRole('button'))

    expect(mocks.dispatch).not.toHaveBeenCalled()
  })

  it('dispatches the Ligretto command exactly once from L only while mounted and enabled', () => {
    mocks.ligrettoCards = [card(4)]
    const tree = () => (
      <CardInteractionProvider enabled>
        <LigrettoDeckContainer />
      </CardInteractionProvider>
    )
    const view = render(tree())
    press('l', 'KeyL')
    expect(mocks.dispatch).toHaveBeenCalledOnce()
    expect(mocks.dispatch).toHaveBeenCalledWith(tapLigrettoDeckCardAction())

    mocks.dispatch.mockClear()
    mocks.ligrettoCards = undefined
    view.rerender(tree())
    press('l', 'KeyL')
    expect(mocks.dispatch).not.toHaveBeenCalled()
  })
})
