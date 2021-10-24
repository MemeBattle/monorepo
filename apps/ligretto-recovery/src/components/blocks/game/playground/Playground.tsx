import React, { useMemo } from 'react'
import styles from './Playground.module.scss'
import { Card, CardPlace, TableCards as TableCardsUI } from '@memebattle/ligretto-ui'
import type { CardsDeck } from '@memebattle/ligretto-shared'

export interface TableCardsProps {
  cardsDecks: CardsDeck[]
  onDeckClick: (deckIndex: number) => void
}

export const Playground: React.FC<TableCardsProps> = ({ cardsDecks, onDeckClick }) => {
  const cards = useMemo(() => {
    const newPlayerCardsArr = []

    for (let i = 0; i < 10; i++) {
      if (cardsDecks[i]) {
        newPlayerCardsArr.push(cardsDecks[i].cards[cardsDecks[i].cards.length - 1])
      } else {
        newPlayerCardsArr.push(undefined)
      }
    }

    return newPlayerCardsArr
  }, [cardsDecks])

  return (
    <div className={styles.tableCardsWrapper}>
      <div className={styles.tableCards}>
        <TableCardsUI>
          {cards.map((card, index) => (
            <CardPlace key={index}>{card && <Card {...card} onClick={() => onDeckClick(index)} />}</CardPlace>
          ))}
        </TableCardsUI>
      </div>
    </div>
  )
}

Playground.displayName = 'Playground'
