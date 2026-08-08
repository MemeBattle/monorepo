import { type Ref } from 'react'
import { Typography } from '@memebattle/ui'
import type { Card as PlayerCards } from '@memebattle/ligretto-shared'

import { Hotkey } from '#ducks/game'
import { CardPlace, Card, CardHotkeyBadge } from '#entities/card'

import styles from './LigrettoPack.module.scss'

interface LigrettoPackProps {
  count: number
  isDndEnabled: boolean
  ligrettoDeckCards: PlayerCards[]
  /** The deck's `isHidden` flag from the game data: the ligretto deck lies face down. */
  isDeckHidden: boolean
  onLigrettoDeckCardClick: () => void
  isHighlighted?: boolean
  isDisabled?: boolean
  ref?: Ref<HTMLDivElement>
  dataTestId?: string
}

export const LigrettoPack = ({
  count,
  isDndEnabled,
  ligrettoDeckCards,
  isDeckHidden,
  onLigrettoDeckCardClick,
  isHighlighted,
  isDisabled,
  ref,
  dataTestId,
}: LigrettoPackProps) => (
  <div ref={ref} data-test-id={dataTestId} className={styles.ligrettoPack}>
    <div className={styles.cardWrapper}>
      <CardHotkeyBadge hotkey={isDndEnabled ? Hotkey.l : undefined}>
        <CardPlace>
          <Card
            {...ligrettoDeckCards[0]}
            isHidden={isDeckHidden && ligrettoDeckCards.length > 0}
            onClick={onLigrettoDeckCardClick}
            isHighlighted={isHighlighted}
            isDisabled={isDisabled}
          />
        </CardPlace>
      </CardHotkeyBadge>
    </div>
    <Typography sx={{ fontSize: { xs: '0.625rem', sm: '1rem' } }}>В колоде: {count}</Typography>
  </div>
)
