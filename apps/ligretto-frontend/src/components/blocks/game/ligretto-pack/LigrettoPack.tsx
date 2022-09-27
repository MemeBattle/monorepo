import React from 'react'
import { CardHotkeyBadge, Typography } from '@memebattle/ui'
import type { Card as PlayerCards } from '@memebattle/ligretto-shared'

import styles from './LigrettoPack.module.scss'
import { Hotkey } from 'ducks/game'
import { CardPlace } from '../CardPlace'
import { Card } from '../Card'

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
    <Typography fontSize={['0.375rem', '1rem']}>В колоде: {count}</Typography>
  </div>
)
