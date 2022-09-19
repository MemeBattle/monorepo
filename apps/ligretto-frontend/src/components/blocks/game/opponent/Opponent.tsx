import React, { useMemo } from 'react'
import clsx from 'clsx'
import { PositionOnTable, Card, CardPlace, Stack } from '@memebattle/ui'
import type { Card as OpponentCard, PlayerStatus, UUID } from '@memebattle/ligretto-shared'

import { Player } from 'components/blocks/game/Player'

import { buildCasStaticUrl } from 'utils/buildCasStaticUrl'

import styles from './Opponent.module.scss'
import { getRandomAvatar } from 'components/Avatar/getRandomAvatar'

const stylesByPosition = {
  [PositionOnTable.Left]: styles.positionLeft,
  [PositionOnTable.Right]: styles.positionRight,
  [PositionOnTable.LeftTopCorner]: styles.positionLeftTopCorner,
  [PositionOnTable.RightTopCorner]: styles.positionRightTopCorner,
  [PositionOnTable.Top]: styles.positionTop,
  [PositionOnTable.Bottom]: styles.positionBottom,
}

export interface OpponentCardsProps {
  position?: PositionOnTable
  stackOpenDeckCards: OpponentCard[]
  cards: (OpponentCard | null)[]
  username: string
  avatar?: string
  status: PlayerStatus
  id: UUID
}

export const Opponent: React.FC<OpponentCardsProps> = ({ position, stackOpenDeckCards, cards, avatar, username, status, id }) => {
  const stackOpenDeckCard = stackOpenDeckCards.length ? stackOpenDeckCards.slice(-1)[0] : {}
  const avatarImg = useMemo(() => (avatar ? buildCasStaticUrl(avatar) : getRandomAvatar(id)), [avatar, id])

  if (!position) {
    return null
  }

  return (
    <div className={clsx(styles.opponentCards, stylesByPosition[position])}>
      <Player status={status} avatar={avatarImg} username={username} />
      <Stack direction="row" spacing={0.5}>
        <CardPlace>
          <Card {...stackOpenDeckCard} />
        </CardPlace>
        {cards.map((card, index) => (
          <CardPlace key={index}>{card ? <Card {...card} /> : null} </CardPlace>
        ))}
      </Stack>
    </div>
  )
}

Opponent.displayName = 'Opponent'
