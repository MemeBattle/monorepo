import React, { useMemo } from 'react'
import styles from './Playground.module.scss'
import { Card, CardPlace, TableCards as TableCardsUI } from '@memebattle/ligretto-ui'
import type { CardsDeck } from '@memebattle/ligretto-shared'
import { CardColors } from '@memebattle/ligretto-shared'

export interface TableCardsProps {
  deskCards: CardsDeck[]
}

export const Playground: React.FC<TableCardsProps> = ({ deskCards }) => {
  const cards = useMemo(() => {
    const newPlayerCardsArr = []

    for (let i = 0; i < 10; i++) {
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      deskCards[i] ? newPlayerCardsArr.push(deskCards[i].cards[deskCards[i].cards.length - 1]) : newPlayerCardsArr.push({ color: CardColors.empty })
    }

    return newPlayerCardsArr
  }, [deskCards])

  return (
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
}

Playground.displayName = 'Playground'
