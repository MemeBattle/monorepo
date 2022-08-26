import React from 'react'
import type { PlayerStatus } from '@memebattle/ligretto-shared'
import { Player } from '@memebattle/ui'

import { CardsRowContainer } from 'containers/cards-row'
import { StackContainer } from 'containers/stack'
import { LigrettoDeckContainer } from 'containers/ligretto-deck/LigrettoDeckContainer'

import styles from './CardsPanel.module.scss'

export interface CardsPanelProps {
  player?: {
    avatar?: string
    status: PlayerStatus
    username: string
  }
}

export const CardsPanel: React.FC<CardsPanelProps> = ({ player }) => (
  <div className={styles.cardsPanel}>
    <div className={styles.stackWrapper}>
      <StackContainer />
    </div>
    <CardsRowContainer />
    <div className={styles.ligrettoPackWrapper}>
      <LigrettoDeckContainer />
    </div>
    <div className={styles.ligrettoActivePlayer}>
      {player ? <Player status={player.status} username={player.username} avatar={player?.avatar} isActivePlayer /> : null}
    </div>
  </div>
)
