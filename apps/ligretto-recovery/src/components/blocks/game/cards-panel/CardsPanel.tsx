import React from 'react'
import type { Card as PlayerCards } from '@memebattle/ligretto-shared'
import { Card, CardsRow } from '@memebattle/ligretto-ui'
import { LigrettoPack } from 'components/blocks/game/ligretto-pack'
import styles from './CardsPanel.module.scss'
import { Stack } from 'components/blocks/game/stack'

export interface CardsPanelProps {
  cards: PlayerCards[]
  stackOpenDeckCards: PlayerCards[]
  stackDeckCards: PlayerCards[]
  ligrettoDeckCards: PlayerCards[]
  handleCardRowClick: (index: number) => void
  handleStackOpenDeckCardClick: () => void
  handleStackDeckCardClick: () => void
  handleLigrettoDeckCardClick: () => void
}

export const CardsPanel: React.FC<CardsPanelProps> = ({
  cards,
  stackOpenDeckCards,
  stackDeckCards,
  ligrettoDeckCards,
  handleCardRowClick,
  handleStackOpenDeckCardClick,
  handleStackDeckCardClick,
  handleLigrettoDeckCardClick,
}) => (
  <div className={styles.cardsPanel}>
    <div className={styles.stackWrapper}>
      <Stack
        stackOpenDeckCards={stackOpenDeckCards}
        stackDeckCards={stackDeckCards}
        handleStackOpenDeckCardClick={handleStackOpenDeckCardClick}
        handleStackDeckCardClick={handleStackDeckCardClick}
      />
    </div>
    <CardsRow>
      {cards.map((card, index) => (
        <Card {...card} key={index} onClick={() => handleCardRowClick(index)} />
      ))}
    </CardsRow>
    <div className={styles.ligrettoPackWrapper}>
      <LigrettoPack count={10} handleLigrettoDeckCardClick={handleLigrettoDeckCardClick} ligrettoDeckCards={ligrettoDeckCards} />
    </div>
  </div>
)
