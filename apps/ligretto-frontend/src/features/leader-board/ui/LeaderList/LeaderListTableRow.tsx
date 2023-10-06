import type { BoxProps } from '@memebattle/ui'
import { Box, useTheme } from '@memebattle/ui'

export const LeaderListTableRow = (props: BoxProps) => {
  const theme = useTheme()

  return <Box borderRadius={1} padding={theme.spacing(1, 1, 1, 1)} {...props} />
}

LeaderListTableRow.displayName = 'LeaderListTableRow'
