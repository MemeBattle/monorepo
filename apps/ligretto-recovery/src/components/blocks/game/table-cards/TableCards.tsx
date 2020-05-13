import React from 'react'
import { CardContainer } from 'containers/card'
import { CardPositions } from '@memebattle/ligretto-shared'
import { MAX_CARDS_ON_TABLE, TABLE_CARDS_PREFIX } from 'config'
import styles from './TableCards.module.scss'

const tableCardsPositions = new Array(MAX_CARDS_ON_TABLE).fill(1).map((_, index) => `${TABLE_CARDS_PREFIX}${index}`)

export const TableCards: React.FC = () => (
  <div className={styles.tableCards}>
    {tableCardsPositions.map(cardPosition => (
      <CardContainer className={styles.card} cardPosition={cardPosition as CardPositions} key={cardPosition} />
    ))}
  </div>
)
