import React from 'react'
import { CardContainer } from 'containers/card'
import styles from './TableCards.module.scss'
import { tablePositions } from 'utils/constants/tableCardsPositions'

export const TableCards: React.FC = () => (
  <div className={styles.tableCards}>
    {tablePositions.map(cardPosition => (
      <CardContainer className={styles.card} cardPosition={cardPosition} key={cardPosition} />
    ))}
  </div>
)
