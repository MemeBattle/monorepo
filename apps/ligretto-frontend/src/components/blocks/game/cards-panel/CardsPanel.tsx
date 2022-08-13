import React from 'react'
import type { Card as PlayerCards, PlayerStatus } from '@memebattle/ligretto-shared'
import { Player } from '@memebattle/ui'

import { LigrettoPack } from 'components/blocks/game/ligretto-pack'
import { CardsRowContainer } from 'containers/cards-row'
import { StackContainer } from 'containers/stack'

import styles from './CardsPanel.module.scss'

export interface CardsPanelProps {
  ligrettoDeckCards?: PlayerCards[]
  onLigrettoDeckCardClick: () => void
  player?: {
    avatar?: string
    status: PlayerStatus
    username: string
  }
}

export const CardsPanel: React.FC<CardsPanelProps> = ({ ligrettoDeckCards, onLigrettoDeckCardClick, player }) => (
  <div className={styles.cardsPanel}>
    <div className={styles.stackWrapper}>
      <StackContainer />
    </div>
    <CardsRowContainer />
    <div className={styles.ligrettoPackWrapper}>
      {ligrettoDeckCards ? (
        <LigrettoPack count={ligrettoDeckCards.length} onLigrettoDeckCardClick={onLigrettoDeckCardClick} ligrettoDeckCards={ligrettoDeckCards} />
      ) : null}
    </div>
    <div className={styles.ligrettoActivePlayer}>
      {player ? <Player status={player.status} username={player.username} avatar={player?.avatar} isActivePlayer /> : null}
    </div>
  </div>
)
