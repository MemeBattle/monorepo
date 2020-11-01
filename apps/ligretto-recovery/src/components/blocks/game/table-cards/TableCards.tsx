import React from 'react'
import { CardContainer } from 'containers/card'
import styles from './TableCards.module.scss'
import { tablePositions } from 'utils/constants/tableCardsPositions'
import { CardPlace, TableCards as TableCardsUI } from '@memebattle/ligretto-ui'

export const TableCards: React.FC = () => (
  <div className={styles.tableCardsWrapper}>
    <div className={styles.tableCards}>
      <TableCardsUI>
        {tablePositions.map(cardPosition => (
          <CardPlace key={cardPosition}>
            <CardContainer cardPosition={cardPosition} key={cardPosition} />
          </CardPlace>
        ))}
      </TableCardsUI>
    </div>
  </div>
)

TableCards.displayName = 'TableCards'
