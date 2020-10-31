import React from 'react'
import { CardContainer } from 'containers/card'
import styles from './TableCards.module.scss'
import { tablePositions } from 'utils/constants/tableCardsPositions'
import { CardPlace } from '@memebattle/ligretto-ui'

export const TableCards: React.FC = () => (
  <div className={styles.tableCards}>
    {tablePositions.map(cardPosition => (
      <CardPlace key={cardPosition}>
        <CardContainer cardPosition={cardPosition} key={cardPosition} />
      </CardPlace>
    ))}
  </div>
)
