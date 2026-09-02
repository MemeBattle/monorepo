import type { Ref } from 'react'
import type { CardsDeck } from '@memebattle/ligretto-shared'

import { TableCards } from './TableCards'
import { PlaygroundDeck } from './PlaygroundDeck'

export interface PlaygroundProps {
  cardsDecks: Array<CardsDeck | null>
  ref?: Ref<HTMLDivElement>
}

export const Playground = ({ cardsDecks, ref }: PlaygroundProps) => (
  <TableCards ref={ref}>
    {Array.from({ length: 12 }, (_, index) => (
      <PlaygroundDeck key={index} cardDeck={cardsDecks[index]} deckIndex={index} />
    ))}
  </TableCards>
)
