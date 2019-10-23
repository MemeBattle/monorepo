import React from 'react'
import { CardContainer } from 'containers/card'
import { CardPositions } from 'types/entities/card-model'
import styles from './OpponentCards.module.scss'

const WrappedCard: React.FC<{ cardPosition: CardPositions }> = ({ cardPosition }) => (
  <div className={styles.card}>
    <CardContainer cardPosition={cardPosition} />
  </div>
)

export const OpponentCards: React.FC = () => (
  <div className={styles.opponentCards}>
    <WrappedCard cardPosition={CardPositions.a} />
    <WrappedCard cardPosition={CardPositions.b} />
    <WrappedCard cardPosition={CardPositions.c} />
    <WrappedCard cardPosition={CardPositions.d} />
  </div>
)
