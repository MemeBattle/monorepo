import React from 'react'
import styles from './TableCards.module.scss'
import { Card, CardPlace, TableCards as TableCardsUI } from '@memebattle/ligretto-ui'
import type { Card as DeskCard } from '@memebattle/ligretto-shared'

export interface TableCardsProps {
  cards: DeskCard[]
}

export const TableCards: React.FC<TableCardsProps> = ({ cards }) => (
  <div className={styles.tableCardsWrapper}>
    <div className={styles.tableCards}>
      <TableCardsUI>
        {cards.map((card, index) => (
          <CardPlace key={index}>
            <Card {...card} />
          </CardPlace>
        ))}
      </TableCardsUI>
    </div>
  </div>
)

TableCards.displayName = 'TableCards'
