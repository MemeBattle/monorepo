import React from 'react'
import { CardContainer } from 'containers/card'
import { CardPositions } from 'types/entities/card-model'
import { MAX_CARDS_ON_TABLE, TABLE_CARDS_PREFIX } from 'config'
import styles from './TableCards.module.scss'

const tableCardsPositions = new Array(MAX_CARDS_ON_TABLE).fill(1).map((_, index) => `${TABLE_CARDS_PREFIX}${index}`)

console.log(tableCardsPositions)

export const TableCards: React.FC = () => (
  <div className={styles.tableCards}>
    {tableCardsPositions.map(cardPosition => (
      <CardContainer cardPosition={cardPosition as CardPositions} key={cardPosition} />
    ))}
  </div>
)
