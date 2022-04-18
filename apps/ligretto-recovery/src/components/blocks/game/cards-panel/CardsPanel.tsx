import React from 'react'
import type { Card, Card as PlayerCards, CardsDeck, PlayerStatus } from '@memebattle/ligretto-shared'
import { Player } from '@memebattle/ligretto-ui'

import { LigrettoPack } from 'components/blocks/game/ligretto-pack'
import { CardsRowContainer } from 'containers/cards-row'
import { StackContainer } from 'containers/stack'

import styles from './CardsPanel.module.scss'

export interface CardsPanelProps {
  ligrettoDeckCards: PlayerCards[]
  onLigrettoDeckCardClick: () => void
  player: {
    avatar: string | undefined
    status?: PlayerStatus | undefined
    isHost?: boolean | undefined
    username?: string | undefined
    id?: string | undefined
    cards?: (Card | null)[] | undefined
    stackOpenDeck?: CardsDeck | undefined
  }
}

export const CardsPanel: React.FC<CardsPanelProps> = ({ ligrettoDeckCards, onLigrettoDeckCardClick, player }) => (
  <div className={styles.cardsPanel}>
    <div className={styles.stackWrapper}>
      <StackContainer />
    </div>
    <CardsRowContainer />
    <div className={styles.ligrettoPackWrapper}>
      <LigrettoPack count={ligrettoDeckCards.length} onLigrettoDeckCardClick={onLigrettoDeckCardClick} ligrettoDeckCards={ligrettoDeckCards} />
    </div>
    <div className={styles.ligrettoActivePlayer}>
      {player.status && player.username && <Player status={player.status} username={player.username} avatar={player?.avatar} isActivePlayer />}
    </div>
  </div>
)
