import React, { useMemo } from 'react'
import { Card as CardComponent, CardPlace, TableCards as TableCardsUI } from '@memebattle/ui'
import type { CardsDeck, Card } from '@memebattle/ligretto-shared'
import last from 'lodash/last'

import styles from './Playground.module.scss'

export interface TableCardsProps {
  cardsDecks: Array<CardsDeck | null>
  onDeckClick: (playgroundDeckIndex: number) => void
}

const getLastCard = (deck: CardsDeck | null): Card | undefined => last(deck?.cards)

export const Playground: React.FC<TableCardsProps> = ({ cardsDecks, onDeckClick }) => {
  const cards: (Card | undefined)[] = useMemo(() => {
    const newPlayerCardsArr = []
    for (let i = 0; i < 12; i++) {
      newPlayerCardsArr.push(getLastCard(cardsDecks[i]))
    }
    return newPlayerCardsArr
  }, [cardsDecks])

  return (
    <div className={styles.tableCardsWrapper}>
      <div className={styles.tableCards}>
        <TableCardsUI>
          {cards.map((card, index) => (
            <CardPlace key={index}>{card && <CardComponent {...card} onClick={() => onDeckClick(index)} />}</CardPlace>
          ))}
        </TableCardsUI>
      </div>
    </div>
  )
}

Playground.displayName = 'Playground'
