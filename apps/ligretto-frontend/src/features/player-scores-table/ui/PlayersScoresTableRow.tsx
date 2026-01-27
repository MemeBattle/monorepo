import type { BoxProps } from '@memebattle/ui'
import { Box, useTheme } from '@memebattle/ui'

export const PlayersScoresTableRow = (props: BoxProps) => {
  const theme = useTheme()

  return <Box borderRadius={1} padding={theme.spacing(2, 2, 2, 2)} mb={1} {...props} />
}

PlayersScoresTableRow.displayName = 'PlayersScoresTableRow'
