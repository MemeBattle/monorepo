import type { FC } from 'react'
import { Box, useTheme } from '@memebattle/ui'

export const GameResultTableHead: FC = ({ children }) => {
  const theme = useTheme()

  return <Box padding={theme.spacing(1, 0, 1, 2)} children={children} />
}

GameResultTableHead.displayName = 'GameResultTableHead'
