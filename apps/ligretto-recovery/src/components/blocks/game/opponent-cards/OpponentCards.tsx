import React from 'react'
import { PositionOnTable, CardsRow, Card, CardPlace } from '@memebattle/ligretto-ui'
import styles from './OpponentCards.module.scss'
import type { Card as OpponentCard } from '@memebattle/ligretto-shared'

const stylesByPosition = {
  [PositionOnTable.Left]: styles.positionLeft,
  [PositionOnTable.Right]: styles.positionRight,
  [PositionOnTable.LeftTopCorner]: styles.positionLeftTopCorner,
  [PositionOnTable.RightTopCorner]: styles.positionRightTopCorner,
  [PositionOnTable.Top]: styles.positionTop,
}

export interface OpponentCardsProps {
  position?: PositionOnTable
  stackOpenDeckCards: OpponentCard[]
  cards: OpponentCard[]
}

export const OpponentCards: React.FC<OpponentCardsProps> = ({ position, stackOpenDeckCards, cards }) => {
  const stackOpenDeckCard = stackOpenDeckCards.length ? stackOpenDeckCards.slice(-1)[0] : {}

  if (!position) {
    return null
  }

  return (
    <div className={stylesByPosition[position]}>
      <CardsRow>
        <CardPlace>
          <Card {...stackOpenDeckCard} />
        </CardPlace>
        {cards.map((card, index) => (
          <Card {...card} key={index} />
        ))}
      </CardsRow>
    </div>
  )
}

OpponentCards.displayName = 'OpponentCards'
