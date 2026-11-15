import type { BoxProps } from '@memebattle/ui'
import { Box } from '@memebattle/ui'

export const PlayersScoresTableRow = ({ sx, ...props }: BoxProps) => (
  <Box
    display="flex"
    alignItems="center"
    minHeight="4.25rem"
    sx={[{ borderRadius: 3, py: 1.5, px: 2, mb: 1 }, ...(Array.isArray(sx) ? sx : [sx])] as BoxProps['sx']}
    {...props}
  />
)

PlayersScoresTableRow.displayName = 'PlayersScoresTableRow'
