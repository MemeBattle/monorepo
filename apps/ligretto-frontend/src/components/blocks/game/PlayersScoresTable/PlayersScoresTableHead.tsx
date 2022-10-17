import type { FC } from 'react'
import { Box, useTheme } from '@memebattle/ui'

export const PlayersScoresTableHead: FC = ({ children }) => {
  const theme = useTheme()

  return <Box padding={theme.spacing(1, 0, 1, 2)} children={children} />
}

PlayersScoresTableHead.displayName = 'PlayersScoresTableHead'
