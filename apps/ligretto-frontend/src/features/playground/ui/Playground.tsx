import type { Ref, RefObject } from 'react'
import type { CardsDeck } from '@memebattle/ligretto-shared'

import type { CardDragData } from '#features/cardPlacement'
import { TableCards } from './TableCards'
import { PlaygroundDeck } from './PlaygroundDeck'

export interface PlaygroundProps {
  cardsDecks: Array<CardsDeck | null>
  onDeckClick: (playgroundDeckIndex: number) => void
  onDeckDrop?: (dragged: CardDragData, playgroundDeckIndex: number) => void
  ref?: Ref<HTMLDivElement>
  deckRefs?: Array<RefObject<HTMLDivElement | null> | undefined>
}

export const Playground = ({ cardsDecks, onDeckClick, onDeckDrop, ref, deckRefs }: PlaygroundProps) => (
  <TableCards ref={ref}>
    {Array.from({ length: 12 }, (_, index) => (
      <PlaygroundDeck
        key={index}
        cardDeck={cardsDecks[index]}
        deckIndex={index}
        ref={deckRefs?.[index]}
        onClick={() => onDeckClick(index)}
        onDrop={dragged => onDeckDrop?.(dragged, index)}
      />
    ))}
  </TableCards>
)
