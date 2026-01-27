import type { FC, PropsWithChildren } from 'react'
import { Box, useTheme } from '@memebattle/ui'

export const PlayersScoresTableHead: FC<PropsWithChildren> = ({ children }) => {
  const theme = useTheme()

  return <Box padding={theme.spacing(1, 1, 1, 2)}>{children}</Box>
}

PlayersScoresTableHead.displayName = 'PlayersScoresTableHead'
