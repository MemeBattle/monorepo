import React from 'react'
import { Card } from '@memebattle/ui'
import type { Card as PlayerCards } from '@memebattle/ligretto-shared'

import styles from './LigrettoPack.module.scss'

interface LigrettoPack {
  count: number
  ligrettoDeckCards: PlayerCards[]
  onLigrettoDeckCardClick: () => void
}
export const LigrettoPack: React.FC<LigrettoPack> = ({ count, ligrettoDeckCards, onLigrettoDeckCardClick }) => (
  <div className={styles.ligrettoPack}>
    <div className={styles.cardWrapper}>
      <Card color={ligrettoDeckCards[0]?.color} onClick={onLigrettoDeckCardClick} />
    </div>
    <span className={styles.title}>Осталось в колоде: {count} </span>
  </div>
)
