import { type Ref } from 'react'
import last from 'lodash/last'
import { Typography } from '@memebattle/ui'
import type { Card as PlayerCards } from '@memebattle/ligretto-shared'

import type { Hotkey } from '#ducks/game'
import { CardPlace, Card, CardHotkeyBadge, CardViewTransition } from '#entities/card'

import styles from './LigrettoPack.module.scss'

interface LigrettoPackProps {
  count: number
  hotkey?: Hotkey
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
  hotkey,
  ligrettoDeckCards,
  isDeckHidden,
  onLigrettoDeckCardClick,
  isHighlighted,
  isDisabled,
  ref,
  dataTestId,
}: LigrettoPackProps) => {
  // The server deals from the end of the deck.
  const top = last(ligrettoDeckCards)

  return (
    <div ref={ref} data-test-id={dataTestId} className={styles.ligrettoPack}>
      <div className={styles.cardWrapper}>
        <CardPlace>
          <CardHotkeyBadge hotkey={hotkey}>
            <CardViewTransition key={top?.id} name={top?.id} isFaceDown={isDeckHidden}>
              <Card
                {...top}
                isHidden={isDeckHidden && top !== undefined}
                onClick={onLigrettoDeckCardClick}
                isHighlighted={isHighlighted}
                isDisabled={isDisabled}
              />
            </CardViewTransition>
          </CardHotkeyBadge>
        </CardPlace>
      </div>
      <Typography sx={{ fontSize: { xs: '0.625rem', sm: '1rem' } }}>В колоде: {count}</Typography>
    </div>
  )
}
