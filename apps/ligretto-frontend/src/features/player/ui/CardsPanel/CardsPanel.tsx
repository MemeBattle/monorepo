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

  return (
    <Box sx={{ mb: 1.5 }} display="flex" justifyContent="center">
      {/* Same single row everywhere — only the player card is dropped on mobile, where it would
          not fit next to the decks. */}
      <Stack spacing={isMobile ? 1 : 2} direction="row">
        {stack}
        {rowCards}
        {ligretto}
        {isMobile || !player ? null : <Player status={player.status} username={player.username} avatar={player?.avatar} isActivePlayer />}
      </Stack>
    </Box>
  )
}
