import React from 'react'
import { CardPositions } from 'types/entities/card-model'
import { useCard } from 'hooks/use-card'
import { Card } from 'components/card'

interface CardContainer {
  cardPosition: CardPositions
  className?: string
}

export const CardContainer: React.FC<CardContainer> = ({ cardPosition, className }) => {
  const card = useCard(cardPosition)

  return <Card {...card} className={className} />
}
