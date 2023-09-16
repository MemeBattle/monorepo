import type { FC } from 'react'
import { PlayerStatus } from '@memebattle/ligretto-shared'

import { PlayerCardsStack } from 'features/player/ui/PlayerCardsStack'
import { LigrettoDeckContainer } from '../LigrettoDeckContainer'
import { Stack, useMediaQuery, useTheme, Box } from '@memebattle/ui'

import { PlayerRowCardsContainer } from '../PlayerRowCardsContainer'
import { Player } from '../Player'

export interface CardsPanelProps {
  player?: {
    avatar?: string
    status: PlayerStatus
    username: string
  }
}

const CardsPanelMobile = () => (
  <Stack mb={2} spacing={1}>
    <Box display="flex" justifyContent="center">
      <PlayerRowCardsContainer />
    </Box>

    <Box display="flex" justifyContent="center">
      <Stack spacing={1} direction="row">
        <PlayerCardsStack />
        <LigrettoDeckContainer />
      </Stack>
    </Box>
  </Stack>
)

export const CardsPanel: FC<CardsPanelProps> = ({ player }) => {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'))

  if (isMobile) {
    return <CardsPanelMobile />
  }

  return (
    <Box mb={1.5} display="flex" justifyContent="center">
      <Stack spacing={2} direction="row">
        {player?.status === PlayerStatus.InGame ? [<PlayerCardsStack />, <PlayerRowCardsContainer />, <LigrettoDeckContainer />] : null}
        {player ? <Player status={player.status} username={player.username} avatar={player?.avatar} isActivePlayer /> : null}
      </Stack>
    </Box>
  )
}
