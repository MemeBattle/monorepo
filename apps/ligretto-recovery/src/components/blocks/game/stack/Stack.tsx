import React from 'react'
import { Card, CardsRow } from '@memebattle/ligretto-ui'
import type { Card as PlayerCards } from '@memebattle/ligretto-shared'

export interface StackProps {
  stackOpenDeckCards: PlayerCards[]
  stackDeckCards: PlayerCards[]
  handleStackOpenDeckCardClick: () => void
  handleStackDeckCardClick: () => void
}

export const Stack: React.FC<StackProps> = ({ stackOpenDeckCards, stackDeckCards, handleStackOpenDeckCardClick, handleStackDeckCardClick }) => {
  const stackOpenDeckCard = stackOpenDeckCards[2] ?? stackOpenDeckCards[1] ?? stackOpenDeckCards[0] ?? {}

  return (
    <CardsRow>
      <Card {...stackOpenDeckCard} onClick={() => handleStackOpenDeckCardClick()} />
      <Card color={stackDeckCards[0]?.color} onClick={() => handleStackDeckCardClick()} />
    </CardsRow>
  )
}
