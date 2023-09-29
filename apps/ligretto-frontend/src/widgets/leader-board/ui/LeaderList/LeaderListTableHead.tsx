import type { FC, PropsWithChildren } from 'react'
import { Box, useTheme } from '@memebattle/ui'

export const LeaderListTableHead: FC<PropsWithChildren> = ({ children }) => {
  const theme = useTheme()

  return <Box padding={theme.spacing(1, 0, 1, 2)}>{children}</Box>
}

LeaderListTableHead.displayName = 'LeaderListTableHead'
