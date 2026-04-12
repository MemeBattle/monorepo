import type { GridProps } from '@memebattle/ui'
import { Grid } from '@memebattle/ui'

export const PlayersScoresTableCell = ({ sx, ...props }: GridProps) => (
  <Grid sx={[{ alignItems: 'center', display: 'flex' }, ...(Array.isArray(sx) ? sx : [sx])] as GridProps['sx']} {...props} />
)

PlayersScoresTableCell.displayName = 'PlayersScoresTableCell'
