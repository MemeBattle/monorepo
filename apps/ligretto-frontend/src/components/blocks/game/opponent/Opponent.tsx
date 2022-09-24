import React, { useMemo } from 'react'
import { Stack } from '@memebattle/ui'
import type { Card as OpponentCard, PlayerStatus, UUID } from '@memebattle/ligretto-shared'

import { Player } from '../Player'
import { Card } from '../Card'

import { buildCasStaticUrl } from 'utils/buildCasStaticUrl'
import { getRandomAvatar } from 'components/Avatar/getRandomAvatar'
import { CardPlace } from '../CardPlace'

export interface OpponentCardsProps {
  stackOpenDeckCards: OpponentCard[]
  cards: (OpponentCard | null)[]
  username: string
  avatar?: string
  status: PlayerStatus
  id: UUID
}

export const Opponent: React.FC<OpponentCardsProps> = ({ stackOpenDeckCards, cards, avatar, username, status, id }) => {
  const stackOpenDeckCard = stackOpenDeckCards.length ? stackOpenDeckCards.slice(-1)[0] : {}
  const avatarImg = useMemo(() => (avatar ? buildCasStaticUrl(avatar) : getRandomAvatar(id)), [avatar, id])

  return (
    <>
      <Player status={status} avatar={avatarImg} username={username} />
      <Stack direction="row" spacing={0.5}>
        <CardPlace size="small">
          <Card size="small" isDisabled {...stackOpenDeckCard} />
        </CardPlace>
        {cards.map((card, index) => (
          <CardPlace size="small" key={index}>
            {card ? <Card isDisabled size="small" {...card} /> : null}
          </CardPlace>
        ))}
      </Stack>
    </>
  )
}

Opponent.displayName = 'Opponent'
