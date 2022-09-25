import type { BoxProps } from '@memebattle/ui'
import { Box, useTheme } from '@memebattle/ui'

export const GameResultTableRow = (props: BoxProps) => {
  const theme = useTheme()

  return <Box borderRadius={1} padding={theme.spacing(2, 0, 2, 2)} mb={1} {...props} />
}

GameResultTableRow.displayName = 'GameResultTableRow'
