import { useMemo, type Ref } from 'react'
import last from 'lodash/last'
import { styled } from '@mui/material/styles'
import { Stack } from '@memebattle/ui'
import type { Card as OpponentCard, UUID } from '@memebattle/ligretto-shared'
import { PlayerStatus } from '@memebattle/ligretto-shared'

import { Player } from '../Player'
import { Card, CardPlace } from '#entities/card'
import { CardViewTransition } from '#features/cardAnimation'

import { getRandomAvatar } from '#shared/ui/Avatar/getRandomAvatar'

// Mobile-first: avatar and cards share one row; odd opponents (1st, 3rd, ...)
// keep the avatar on the left, even ones on the right; desktop stacks them back
// into a block. The order relies on opponents being same-tag siblings.
const OpponentBox = styled('div')(({ theme }) => ({
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'flex-start',
  gap: '0.5rem',
  width: '100%',
  marginTop: '10px',
  '&:nth-of-type(even)': {
    flexDirection: 'row-reverse',
  },
  [theme.breakpoints.up('md')]: {
    display: 'block',
    width: 'auto',
    marginTop: 0,
  },
}))

export interface OpponentCardsProps {
  stackOpenDeckCards: OpponentCard[]
  cards: (OpponentCard | null)[]
  username: string
  avatar?: string
  status: PlayerStatus
  id: UUID
  ref?: Ref<HTMLDivElement>
}

export const Opponent = ({ stackOpenDeckCards, cards, avatar, username, status, id, ref }: OpponentCardsProps) => {
  const stackOpenDeckCard = last(stackOpenDeckCards)
  const avatarImg = useMemo(() => avatar ?? getRandomAvatar(id), [avatar, id])
  const isDisconnected = status === PlayerStatus.Disconnected

  return (
    <OpponentBox ref={ref} role="group" aria-label={`${username} player`} data-connection-state={isDisconnected ? 'disconnected' : 'online'}>
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
            {stackOpenDeckCard ? (
              <CardViewTransition key={stackOpenDeckCard.id} name={stackOpenDeckCard.id}>
                <Card isDisabled size="small" {...stackOpenDeckCard} />
              </CardViewTransition>
            ) : (
              <Card size="small" isDisabled />
            )}
          </CardPlace>
          {cards.map((card, index) => (
            <CardPlace size="small" key={index}>
              {card ? (
                <CardViewTransition key={card.id} name={card.id}>
                  <Card isDisabled size="small" {...card} />
                </CardViewTransition>
              ) : null}
            </CardPlace>
          ))}
        </Stack>
      ) : null}
    </OpponentBox>
  )
}
