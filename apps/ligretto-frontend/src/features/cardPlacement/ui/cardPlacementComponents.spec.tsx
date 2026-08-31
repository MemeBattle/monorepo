// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CardColors } from '@memebattle/ligretto-shared'

import { Card } from '#entities/card'
import { CardFocusProvider } from '#features/cardFocus'
import { CardPlacementProvider } from './CardPlacementProvider'
import { DraggableCard } from './DraggableCard'
import { PlaygroundDeckDropTarget } from './PlaygroundDeckDropTarget'

vi.mock('react-redux', async importActual => ({
  ...(await importActual<typeof import('react-redux')>()),
  useDispatch: () => vi.fn(),
  useSelector: (selector: (state: unknown) => unknown) => selector({}),
}))

vi.mock('#ducks/game', async importActual => ({
  ...(await importActual<typeof import('#ducks/game')>()),
  gameIdSelector: () => 'game',
}))

afterEach(cleanup)

const Wrapper = ({ children }: React.PropsWithChildren) => (
  <CardFocusProvider enabled>
    <CardPlacementProvider enabled>{children}</CardPlacementProvider>
  </CardFocusProvider>
)

describe('card placement DnD components', () => {
  it('registers a rendered card as a draggable source', () => {
    render(
      <DraggableCard target={{ type: 'row', index: 1 }} card={{ color: CardColors.red, value: 2 }}>
        <Card color={CardColors.red} value={2} />
      </DraggableCard>,
      { wrapper: Wrapper },
    )

    expect(screen.getByTestId('card-drag-source').getAttribute('data-card-drag-id')).toBe('row.1.red.2')
  })

  it('registers an empty playground slot as a drop target', () => {
    render(
      <PlaygroundDeckDropTarget deckIndex={4} deck={null}>
        <div>slot</div>
      </PlaygroundDeckDropTarget>,
      { wrapper: Wrapper },
    )

    expect(screen.getByText('slot').parentElement?.getAttribute('data-card-drop-target')).toBe('4')
  })
})
