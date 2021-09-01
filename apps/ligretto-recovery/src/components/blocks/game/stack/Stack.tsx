import React from 'react'
import { Card, CardPlace, CardsRow } from '@memebattle/ligretto-ui'
import type { Card as PlayerCards } from '@memebattle/ligretto-shared'

export interface StackProps {
  stackOpenDeckCards: PlayerCards[]
  stackDeckCards: PlayerCards[]
  onStackOpenDeckCardClick: () => void
  onStackDeckCardClick: () => void
}

export const Stack: React.FC<StackProps> = ({ stackOpenDeckCards, stackDeckCards, onStackOpenDeckCardClick, onStackDeckCardClick }) => {
  const stackOpenDeckCard = stackOpenDeckCards[stackOpenDeckCards.length - 1] ? stackOpenDeckCards[stackOpenDeckCards.length - 1] : {}

  return (
    <CardsRow>
      <CardPlace>
        <Card {...stackOpenDeckCard} onClick={onStackOpenDeckCardClick} />
      </CardPlace>
      <CardPlace>
        <Card color={stackDeckCards[0]?.color} onClick={onStackDeckCardClick} />
      </CardPlace>
    </CardsRow>
  )
}
