import React, { useMemo } from 'react'
import type { CardsDeck, Card } from '@memebattle/ligretto-shared'
import last from 'lodash/last'
import { CardPlace } from '../CardPlace'
import { TableCards } from '../TableCards'
import { Card as CardComponent } from '../Card'

export interface PlaygroundProps {
  cardsDecks: Array<CardsDeck | null>
  onDeckClick: (playgroundDeckIndex: number) => void
}

const getLastCard = (deck: CardsDeck | null): Card | undefined => last(deck?.cards)

export const Playground: React.FC<PlaygroundProps> = ({ cardsDecks, onDeckClick }) => {
  const cards: (Card | undefined)[] = useMemo(() => {
    const newPlayerCardsArr = []
    for (let i = 0; i < 12; i++) {
      newPlayerCardsArr.push(getLastCard(cardsDecks[i]))
    }
    return newPlayerCardsArr
  }, [cardsDecks])

  return (
    <TableCards>
      {cards.map((card, index) => (
        <CardPlace key={index} size="large">
          {card && <CardComponent size="large" {...card} onClick={() => onDeckClick(index)} />}
        </CardPlace>
      ))}
    </TableCards>
  )
}

Playground.displayName = 'Playground'
