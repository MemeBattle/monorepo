import React from 'react'
import type { Card as PlayerCards } from '@memebattle/ligretto-shared'
import { LigrettoPack } from 'components/blocks/game/ligretto-pack'
import styles from './CardsPanel.module.scss'
import { Stack } from 'components/blocks/game/stack'
import { CardsRowContainer } from '../../../../containers/cards-row'

export interface CardsPanelProps {
  stackOpenDeckCards: PlayerCards[]
  stackDeckCards: PlayerCards[]
  ligrettoDeckCards: PlayerCards[]
  onStackOpenDeckCardClick: () => void
  onStackDeckCardClick: () => void
  onLigrettoDeckCardClick: () => void
}

export const CardsPanel: React.FC<CardsPanelProps> = ({
  stackOpenDeckCards,
  stackDeckCards,
  ligrettoDeckCards,
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
    <CardsRowContainer />
    <div className={styles.ligrettoPackWrapper}>
      <LigrettoPack count={ligrettoDeckCards.length} onLigrettoDeckCardClick={onLigrettoDeckCardClick} ligrettoDeckCards={ligrettoDeckCards} />
    </div>
  </div>
)
