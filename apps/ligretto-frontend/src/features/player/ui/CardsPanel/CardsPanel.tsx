import type { FC, ReactNode } from 'react'
import type { PlayerStatus } from '@memebattle/ligretto-shared'

import { Stack, useMediaQuery, useTheme, Box } from '@memebattle/ui'

import { Player } from '../Player'

export interface CardsPanelProps {
  player?: {
    avatar?: string
    status: PlayerStatus
    username: string
  }
  /** Hand decks — the closed stack together with its open card. */
  stack?: ReactNode
  /** The player's face-up row. */
  rowCards?: ReactNode
  /** The ligretto deck. */
  ligretto?: ReactNode
}

export const CardsPanel: FC<CardsPanelProps> = ({ player, stack, rowCards, ligretto }) => {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'))

  if (isMobile) {
    // Two stacked rows: the face-up row on top, the hand decks below it.
    // The player badge does not fit here and is dropped, as it always was on mobile.
    return (
      <Stack sx={{ mb: 2 }} spacing={1}>
        <Box display="flex" justifyContent="center">
          {rowCards}
        </Box>

        <Box display="flex" justifyContent="center">
          <Stack spacing={1} direction="row">
            {stack}
            {ligretto}
          </Stack>
        </Box>
      </Stack>
    )
  }

  return (
    <Box sx={{ mb: 1.5 }} display="flex" justifyContent="center">
      <Stack spacing={2} direction="row">
        {stack}
        {rowCards}
        {ligretto}
        {player ? <Player status={player.status} username={player.username} avatar={player?.avatar} isActivePlayer /> : null}
      </Stack>
    </Box>
  )
}
