import React, { useMemo } from 'react'
import styles from './Playground.module.scss'
import { Card as CardComponent, CardPlace, TableCards as TableCardsUI } from '@memebattle/ligretto-ui'
import type { CardsDeck, Card } from '@memebattle/ligretto-shared'
import last from 'lodash/last'

export interface TableCardsProps {
  cardsDecks: Array<CardsDeck | null>
  onDeckClick: (playgroundDeckIndex: number) => void
}

const getLastCard = (deck: CardsDeck | null): Card | undefined => last(deck?.cards)

export const Playground: React.FC<TableCardsProps> = ({ cardsDecks }) => {
  const cards: (Card | undefined)[] = useMemo(() => {
    const ar = []
    for (let i = 0; i < 10; i++) {
      ar.push(getLastCard(cardsDecks[i]))
    }
    return ar
  }, [cardsDecks])
  return (
    <div className={styles.tableCardsWrapper}>
      <div className={styles.tableCards}>
        <TableCardsUI>
          {cards.map((card, index) => (
            <CardPlace key={index}>{card && <CardComponent {...card} />}</CardPlace>
          ))}
        </TableCardsUI>
      </div>
    </div>
  )
}

Playground.displayName = 'Playground'
