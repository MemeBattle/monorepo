import React from 'react'
import type { Card as PlayerCards } from '@memebattle/ligretto-shared'
import { LigrettoPack } from 'components/blocks/game/ligretto-pack'
import { CardsRowContainer } from '../../../../containers/cards-row'
import { StackContainer } from '../../../../containers/stack'

import styles from './CardsPanel.module.scss'

export interface CardsPanelProps {
  ligrettoDeckCards: PlayerCards[]
  onLigrettoDeckCardClick: () => void
}

export const CardsPanel: React.FC<CardsPanelProps> = ({ ligrettoDeckCards, onLigrettoDeckCardClick }) => (
  <div className={styles.cardsPanel}>
    <div className={styles.stackWrapper}>
      <StackContainer />
    </div>
    <CardsRowContainer />
    <div className={styles.ligrettoPackWrapper}>
      <LigrettoPack count={ligrettoDeckCards.length} onLigrettoDeckCardClick={onLigrettoDeckCardClick} ligrettoDeckCards={ligrettoDeckCards} />
    </div>
  </div>
)
