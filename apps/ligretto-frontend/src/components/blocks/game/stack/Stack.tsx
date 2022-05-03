import React from 'react'
import { Card, CardPlace, CardsRow } from '@memebattle/ligretto-ui'
import type { Card as PlayerCards } from '@memebattle/ligretto-shared'

export interface StackProps {
  stackOpenDeckCard: PlayerCards
  stackDeckCards: PlayerCards[]
  onStackOpenDeckCardClick: () => void
  onStackDeckCardClick: () => void
  onStackDeckCardOutsideClick: () => void
  isStackOpenDeckSelected: boolean
}

export const Stack: React.FC<StackProps> = ({
  stackOpenDeckCard,
  stackDeckCards,
  onStackOpenDeckCardClick,
  onStackDeckCardClick,
  onStackDeckCardOutsideClick,
  isStackOpenDeckSelected,
}) => (
  <CardsRow>
    <CardPlace>
      <Card
        {...stackOpenDeckCard}
        selected={isStackOpenDeckSelected}
        onClick={onStackOpenDeckCardClick}
        onClickOutside={isStackOpenDeckSelected ? onStackDeckCardOutsideClick : undefined}
      />
    </CardPlace>
    <CardPlace>
      <Card color={stackDeckCards[0]?.color} onClick={onStackDeckCardClick} />
    </CardPlace>
  </CardsRow>
)
