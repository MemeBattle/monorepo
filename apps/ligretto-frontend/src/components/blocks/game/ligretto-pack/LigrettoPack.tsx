import React from 'react'
import { Card, CardHotkeyBadge, CardPlace } from '@memebattle/ui'
import type { Card as PlayerCards } from '@memebattle/ligretto-shared'

import styles from './LigrettoPack.module.scss'
import { Hotkey } from 'ducks/game'

interface LigrettoPack {
  count: number
  isDndEnabled: boolean
  ligrettoDeckCards: PlayerCards[]
  onLigrettoDeckCardClick: () => void
}

export const LigrettoPack: React.FC<LigrettoPack> = ({ count, isDndEnabled, ligrettoDeckCards, onLigrettoDeckCardClick }) => (
  <div className={styles.ligrettoPack}>
    <div className={styles.cardWrapper}>
      <CardHotkeyBadge hotkey={isDndEnabled ? Hotkey.l : undefined}>
        <CardPlace>
          <Card color={ligrettoDeckCards[0]?.color} onClick={onLigrettoDeckCardClick} />
        </CardPlace>
      </CardHotkeyBadge>
    </div>
    <span className={styles.title}>Осталось в колоде: {count} </span>
  </div>
)
