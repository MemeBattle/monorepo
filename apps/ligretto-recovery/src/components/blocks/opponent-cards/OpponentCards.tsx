import React from 'react'
import cn from 'classnames'
import { CardContainer } from 'containers/card'
import { CardPositions } from 'types/entities/card-model'
import { PositionOnTable } from 'components/base/room-grid'
import styles from './OpponentCards.module.scss'

const WrappedCard: React.FC<{ cardPosition: CardPositions }> = ({ cardPosition }) => (
  <CardContainer className={styles.card} cardPosition={cardPosition} />
)

const stylesByPosition = {
  [PositionOnTable.Left]: styles.positionLeft,
  [PositionOnTable.Right]: styles.positionRight,
  [PositionOnTable.LeftTopCorner]: styles.positionLeftTopCorner,
  [PositionOnTable.RightTopCorner]: styles.positionRightTopCorner,
  [PositionOnTable.Top]: styles.positionTop,
}

export interface OpponentCardsProps {
  positionOnTable: PositionOnTable
  className?: string
}
export const OpponentCards: React.FC<OpponentCardsProps> = ({ positionOnTable, className }) => (
  <div className={cn(styles.opponentCards, stylesByPosition[positionOnTable], className)}>
    <WrappedCard cardPosition={CardPositions.a} />
    <WrappedCard cardPosition={CardPositions.b} />
    <WrappedCard cardPosition={CardPositions.c} />
    <WrappedCard cardPosition={CardPositions.d} />
  </div>
)

OpponentCards.displayName = 'OpponentCards'
