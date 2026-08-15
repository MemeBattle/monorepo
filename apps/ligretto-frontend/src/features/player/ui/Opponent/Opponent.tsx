import { useMemo, type Ref } from 'react'
import { styled } from '@mui/material/styles'
import { Stack } from '@memebattle/ui'
import type { Card as OpponentCard, UUID } from '@memebattle/ligretto-shared'
import { PlayerStatus } from '@memebattle/ligretto-shared'

import { Player } from '../Player'
import { Card, CardPlace } from '#entities/card'

import { buildCasStaticUrl } from '#shared/api/buildCasStaticUrl'
import { getRandomAvatar } from '#shared/ui/Avatar/getRandomAvatar'

// Mobile-first: avatar and cards share one row, even opponents keep the avatar
// on the left and odd ones on the right; desktop stacks them back into a block
const OpponentBox = styled('div', { shouldForwardProp: prop => prop !== 'index' })<{ index: number }>(({ index, theme }) => ({
  display: 'flex',
  flexDirection: index % 2 === 0 ? 'row' : 'row-reverse',
  alignItems: 'center',
  justifyContent: 'flex-start',
  width: '100%',
  [theme.breakpoints.up('md')]: {
    display: 'block',
    width: 'auto',
  },
}))

export interface OpponentCardsProps {
  stackOpenDeckCards: OpponentCard[]
  cards: (OpponentCard | null)[]
  username: string
  avatar?: string
  status: PlayerStatus
  id: UUID
  /** Zero-based position among opponents: on mobile even ones keep the avatar on the left, odd ones on the right */
  index?: number
  ref?: Ref<HTMLDivElement>
}

export const Opponent = ({ stackOpenDeckCards, cards, avatar, username, status, id, index = 0, ref }: OpponentCardsProps) => {
  const stackOpenDeckCard = useMemo(() => (stackOpenDeckCards.length ? stackOpenDeckCards.slice(-1)[0] : {}), [stackOpenDeckCards])
  const avatarImg = useMemo(() => (avatar ? buildCasStaticUrl(avatar) : getRandomAvatar(id)), [avatar, id])
  const isDisconnected = status === PlayerStatus.Disconnected

  return (
    <OpponentBox
      ref={ref}
      role="group"
      aria-label={`${username} player`}
      data-connection-state={isDisconnected ? 'disconnected' : 'online'}
      index={index}
    >
      <Player status={status} avatar={avatarImg} username={username} />
      {status === PlayerStatus.InGame || isDisconnected ? (
        <Stack
          direction="row"
          spacing={0.5}
          data-testid="opponent-cards"
          sx={{
            filter: isDisconnected ? 'grayscale(1)' : 'none',
            opacity: isDisconnected ? 0.5 : 1,
            transition: 'filter 150ms, opacity 150ms',
          }}
        >
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
    </OpponentBox>
  )
}
