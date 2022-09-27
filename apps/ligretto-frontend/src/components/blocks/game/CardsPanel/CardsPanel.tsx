import React from 'react'
import type { PlayerStatus } from '@memebattle/ligretto-shared'
import { Player } from '../Player'

import { CardsRowContainer } from 'containers/cards-row'
import { StackContainer } from 'containers/stack'
import { LigrettoDeckContainer } from 'containers/ligretto-deck/LigrettoDeckContainer'
import { Stack, useMediaQuery, useTheme, Box } from '@memebattle/ui'

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
      <CardsRowContainer />
    </Box>

    <Box display="flex" justifyContent="center">
      <Stack spacing={1} direction="row">
        <StackContainer />
        <LigrettoDeckContainer />
      </Stack>
    </Box>
  </Stack>
)

export const CardsPanel: React.FC<CardsPanelProps> = ({ player }) => {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'))

  if (isMobile) {
    return <CardsPanelMobile />
  }

  return (
    <Box mb={1.5} display="flex" justifyContent="center">
      <Stack spacing={2} direction="row">
        <StackContainer />
        <CardsRowContainer />
        <LigrettoDeckContainer />
        {player ? <Player status={player.status} username={player.username} avatar={player?.avatar} isActivePlayer /> : null}
      </Stack>
    </Box>
  )
}
