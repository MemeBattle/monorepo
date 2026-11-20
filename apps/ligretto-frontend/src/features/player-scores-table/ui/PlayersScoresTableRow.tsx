import type { BoxProps } from '@memebattle/ui'
import { Box } from '@memebattle/ui'

export const PlayersScoresTableRow = ({ sx, ...props }: BoxProps) => (
  <Box
    display="flex"
    alignItems="center"
    sx={[{ height: '4.5rem', borderRadius: 3, px: 2, mb: 1 }, ...(Array.isArray(sx) ? sx : [sx])] as BoxProps['sx']}
    {...props}
  />
)

PlayersScoresTableRow.displayName = 'PlayersScoresTableRow'
