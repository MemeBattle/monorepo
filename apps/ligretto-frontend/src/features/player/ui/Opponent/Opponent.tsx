import { useMemo, type Ref } from 'react'
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
  isDisconnected?: boolean
  ref?: Ref<HTMLDivElement>
}

export const Opponent = ({ stackOpenDeckCards, cards, avatar, username, status, id, isDisconnected = false, ref }: OpponentCardsProps) => {
  const stackOpenDeckCard = useMemo(() => (stackOpenDeckCards.length ? stackOpenDeckCards.slice(-1)[0] : {}), [stackOpenDeckCards])
  const avatarImg = useMemo(() => (avatar ? buildCasStaticUrl(avatar) : getRandomAvatar(id)), [avatar, id])

  return (
    <Box
      ref={ref}
      role="group"
      aria-label={`${username} player`}
      data-connection-state={isDisconnected ? 'disconnected' : 'online'}
      sx={{
        filter: isDisconnected ? 'grayscale(1)' : 'none',
        opacity: isDisconnected ? 0.5 : 1,
        transition: 'filter 150ms, opacity 150ms',
      }}
    >
      <Player status={status} avatar={avatarImg} username={username} isDisconnected={isDisconnected} />
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
