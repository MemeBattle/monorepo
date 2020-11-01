import React from 'react'
import cn from 'classnames'
import { CardContainer } from 'containers/card'
import { CardPositions } from '@memebattle/ligretto-shared'
import { PositionOnTable, CardsRow } from '@memebattle/ligretto-ui'
import styles from './OpponentCards.module.scss'

const stylesByPosition = {
  [PositionOnTable.Left]: styles.positionLeft,
  [PositionOnTable.Right]: styles.positionRight,
  [PositionOnTable.LeftTopCorner]: styles.positionLeftTopCorner,
  [PositionOnTable.RightTopCorner]: styles.positionRightTopCorner,
  [PositionOnTable.Top]: styles.positionTop,
}

const cardsPositionsByPositionOnTable: { [position in PositionOnTable]: CardPositions[] } = {
  [PositionOnTable.Left]: [CardPositions.l0, CardPositions.l1, CardPositions.l2, CardPositions.l3],
  [PositionOnTable.Right]: [CardPositions.r0, CardPositions.r1, CardPositions.r2, CardPositions.r3],
  [PositionOnTable.Top]: [CardPositions.o0, CardPositions.o1, CardPositions.o2, CardPositions.o3],
  [PositionOnTable.LeftTopCorner]: [CardPositions.l0, CardPositions.l1, CardPositions.l2, CardPositions.l3],
  [PositionOnTable.RightTopCorner]: [CardPositions.r0, CardPositions.r1, CardPositions.r2, CardPositions.r3],
}

export interface OpponentCardsProps {
  positionOnTable: PositionOnTable
}
export const OpponentCards: React.FC<OpponentCardsProps> = ({ positionOnTable }) => (
  <div className={stylesByPosition[positionOnTable]}>
    <CardsRow>
      {cardsPositionsByPositionOnTable[positionOnTable].map(cardPosition => (
        <CardContainer key={cardPosition} cardPosition={cardPosition} />
      ))}
    </CardsRow>
  </div>
)

OpponentCards.displayName = 'OpponentCards'
