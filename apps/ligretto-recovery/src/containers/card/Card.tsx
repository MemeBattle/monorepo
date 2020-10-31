import React from 'react'
import { CardPositions } from '@memebattle/ligretto-shared'
import { useCard } from 'hooks/use-card'
import { Card } from '@memebattle/ligretto-ui'

interface CardContainer {
  cardPosition: CardPositions
}

export const CardContainer: React.FC<CardContainer> = ({ cardPosition }) => {
  const card = useCard(cardPosition)

  return <Card {...card} />
}
