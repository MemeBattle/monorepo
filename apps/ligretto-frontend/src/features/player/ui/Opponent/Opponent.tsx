import React, { useMemo } from 'react'
import { Box, Stack } from '@memebattle/ui'
import type { Card as OpponentCard, UUID } from '@memebattle/ligretto-shared'
import { PlayerStatus } from '@memebattle/ligretto-shared'

import { Player } from '../Player'
import { Card, CardPlace } from '#entities/card'

import { buildCasStaticUrl } from '#shared/api/buildCasStaticUrl'
import { getRandomAvatar } from '#shared/ui/Avatar/getRandomAvatar'

export interface OpponentCardsProps {
  stackOpenDeckCards: OpponentCard[]
  cards: (OpponentCard | null)[]
  username: string
  avatar?: string
  status: PlayerStatus
  id: UUID
}

export const Opponent: React.FC<OpponentCardsProps> = ({ stackOpenDeckCards, cards, avatar, username, status, id }) => {
  const stackOpenDeckCard = useMemo(() => (stackOpenDeckCards.length ? stackOpenDeckCards.slice(-1)[0] : {}), [stackOpenDeckCards])
  const avatarImg = useMemo(() => (avatar ? buildCasStaticUrl(avatar) : getRandomAvatar(id)), [avatar, id])

  return (
    <Box>
      <Player status={status} avatar={avatarImg} username={username} />
      {status === PlayerStatus.InGame ? (
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
      ) : null}
    </Box>
  )
}

Opponent.displayName = 'Opponent'
