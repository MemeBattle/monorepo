import React, { useMemo } from 'react'
import styles from './Playground.module.scss'
import { Card, CardPlace, TableCards as TableCardsUI } from '@memebattle/ligretto-ui'
import type { CardsDeck } from '@memebattle/ligretto-shared'
import { CardColors } from '@memebattle/ligretto-shared'

export interface TableCardsProps {
  cardsDecks: CardsDeck[]
}

export const Playground: React.FC<TableCardsProps> = ({ cardsDecks }) => {
  const cards = useMemo(() => {
    const newPlayerCardsArr = []

    for (let i = 0; i < 10; i++) {
      if (cardsDecks[i]) {
        newPlayerCardsArr.push(cardsDecks[i].cards[cardsDecks[i].cards.length - 1])
      } else {
        newPlayerCardsArr.push({ color: CardColors.empty })
      }
    }

    return newPlayerCardsArr
  }, [cardsDecks])
  return (
    <div className={styles.tableCardsWrapper}>
      <div className={styles.tableCards}>
        <TableCardsUI>
          {cards.map((card, index) => (
            <CardPlace key={index}>{card.value === 10 ? null : <Card {...card} />}</CardPlace>
          ))}
        </TableCardsUI>
      </div>
    </div>
  )
}

Playground.displayName = 'Playground'
