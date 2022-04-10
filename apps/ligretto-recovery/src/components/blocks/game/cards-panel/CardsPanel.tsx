import React, { useMemo } from 'react'
import type { Card as PlayerCards } from '@memebattle/ligretto-shared'
import { Player } from '@memebattle/ligretto-ui'
import { useSelector } from 'react-redux'

import { LigrettoPack } from 'components/blocks/game/ligretto-pack'
import { CardsRowContainer } from 'containers/cards-row'
import { StackContainer } from 'containers/stack'
import { selectActivePlayer } from 'ducks/game'
import { buildCasStaticUrl } from 'utils/buildCasStaticUrl'

import styles from './CardsPanel.module.scss'

export interface CardsPanelProps {
  ligrettoDeckCards: PlayerCards[]
  onLigrettoDeckCardClick: () => void
}

export const CardsPanel: React.FC<CardsPanelProps> = ({ ligrettoDeckCards, onLigrettoDeckCardClick }) => {
  const { username, status, avatar } = useSelector(selectActivePlayer)
  const avatarImg = useMemo(() => (avatar ? buildCasStaticUrl(avatar) : undefined), [avatar])
  return (
    <div className={styles.cardsPanel}>
      <div className={styles.stackWrapper}>
        <StackContainer />
      </div>
      <CardsRowContainer />
      <div className={styles.ligrettoPackWrapper}>
        <LigrettoPack count={ligrettoDeckCards.length} onLigrettoDeckCardClick={onLigrettoDeckCardClick} ligrettoDeckCards={ligrettoDeckCards} />
      </div>
      <div className={styles.ligrettoActivePlayer}>
        <Player status={status} username={username} avatar={avatarImg} isActivePlayer />
      </div>
    </div>
  )
}
