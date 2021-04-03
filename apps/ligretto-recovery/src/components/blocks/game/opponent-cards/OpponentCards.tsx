import React from 'react'
import { PositionOnTable, CardsRow, Card } from '@memebattle/ligretto-ui'
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
  positionOnTable: PositionOnTable
  stackOpenDeckCards: OpponentCard[]
  cards: OpponentCard[]
}

export const OpponentCards: React.FC<OpponentCardsProps> = ({ positionOnTable, stackOpenDeckCards, cards }) => {
  const stackOpenDeckCard = stackOpenDeckCards.length ? stackOpenDeckCards.slice(-1)[0] : {}

  return (
    <div className={stylesByPosition[positionOnTable]}>
      <CardsRow>
        <Card {...stackOpenDeckCard} />
        {cards.map((card, index) => (
          <Card {...card} key={index} />
        ))}
      </CardsRow>
    </div>
  )
}

OpponentCards.displayName = 'OpponentCards'
