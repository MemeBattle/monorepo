import React, { useMemo } from 'react'
import clsx from 'clsx'
import { PositionOnTable, CardsRow, Card, CardPlace, Player } from '@memebattle/ligretto-ui'
import styles from './Opponent.module.scss'
import type { Card as OpponentCard } from '@memebattle/ligretto-shared'
import { buildCasStaticUrl } from 'utils/buildCasStaticUrl'
import type { PlayerStatus } from '@memebattle/ligretto-shared'

const stylesByPosition = {
  [PositionOnTable.Left]: styles.positionLeft,
  [PositionOnTable.Right]: styles.positionRight,
  [PositionOnTable.LeftTopCorner]: styles.positionLeftTopCorner,
  [PositionOnTable.RightTopCorner]: styles.positionRightTopCorner,
  [PositionOnTable.Top]: styles.positionTop,
}

export interface OpponentCardsProps {
  position?: PositionOnTable
  stackOpenDeckCards: OpponentCard[]
  cards: (OpponentCard | null)[]
  username: string
  avatar?: string
  status: PlayerStatus
}

export const Opponent: React.FC<OpponentCardsProps> = ({ position, stackOpenDeckCards, cards, avatar, username, status }) => {
  const stackOpenDeckCard = stackOpenDeckCards.length ? stackOpenDeckCards.slice(-1)[0] : {}
  const avatarImg = useMemo(() => (avatar ? buildCasStaticUrl(avatar) : undefined), [avatar])

  if (!position) {
    return null
  }

  return (
    <div className={clsx(styles.opponentCards, stylesByPosition[position])}>
      <Player status={status} avatar={avatarImg} username={username} />
      <CardsRow>
        <CardPlace>
          <Card {...stackOpenDeckCard} />
        </CardPlace>
        {cards.map((card, index) => (
          <CardPlace key={index}>{card ? <Card {...card} /> : null} </CardPlace>
        ))}
      </CardsRow>
    </div>
  )
}

Opponent.displayName = 'Opponent'
