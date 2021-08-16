import React from 'react'
import type { Card as PlayerCards } from '@memebattle/ligretto-shared'
import {Card, CardPlace, CardsRow} from '@memebattle/ligretto-ui'
import { LigrettoPack } from 'components/blocks/game/ligretto-pack'
import styles from './CardsPanel.module.scss'
import { Stack } from 'components/blocks/game/stack'

export interface CardsPanelProps {
  cards: PlayerCards[]
  stackOpenDeckCards: PlayerCards[]
  stackDeckCards: PlayerCards[]
  ligrettoDeckCards: PlayerCards[]
  onCardRowClick: (index: number) => void
  onStackOpenDeckCardClick: () => void
  onStackDeckCardClick: () => void
  onLigrettoDeckCardClick: () => void
}

export const CardsPanel: React.FC<CardsPanelProps> = ({
  cards,
  stackOpenDeckCards,
  stackDeckCards,
  ligrettoDeckCards,
  onCardRowClick,
  onStackOpenDeckCardClick,
  onStackDeckCardClick,
  onLigrettoDeckCardClick,
}) => (
  <div className={styles.cardsPanel}>
    <div className={styles.stackWrapper}>
      <Stack
        stackOpenDeckCards={stackOpenDeckCards}
        stackDeckCards={stackDeckCards}
        onStackOpenDeckCardClick={onStackOpenDeckCardClick}
        onStackDeckCardClick={onStackDeckCardClick}
      />
    </div>
    <CardsRow>
      {cards.map((card, index) => (
        <CardPlace key={index}>{Object.keys(card).length !== 0 ? <Card {...card} onClick={() => onCardRowClick(index)} /> : null}</CardPlace>
      ))}
    </CardsRow>
    <div className={styles.ligrettoPackWrapper}>
      <LigrettoPack count={10} onLigrettoDeckCardClick={onLigrettoDeckCardClick} ligrettoDeckCards={ligrettoDeckCards} />
    </div>
  </div>
)
