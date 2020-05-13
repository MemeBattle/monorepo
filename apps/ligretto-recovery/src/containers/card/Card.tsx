import React from 'react'
import { CardPositions } from '@memebattle/ligretto-shared'
import { useCard } from 'hooks/use-card'
import { Card } from 'components/shared/card'

interface CardContainer {
  cardPosition: CardPositions
  className?: string
}

export const CardContainer: React.FC<CardContainer> = ({ cardPosition, className }) => {
  const card = useCard(cardPosition)

  return <Card {...card} className={className} />
}
