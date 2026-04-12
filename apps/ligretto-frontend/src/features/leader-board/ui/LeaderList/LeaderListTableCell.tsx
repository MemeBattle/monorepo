import type { GridProps } from '@memebattle/ui'
import { Grid } from '@memebattle/ui'

export const LeaderListTableCell = ({ sx, ...props }: GridProps) => (
  <Grid sx={[{ alignItems: 'center', display: 'flex' }, ...(Array.isArray(sx) ? sx : [sx])] as GridProps['sx']} {...props} />
)

LeaderListTableCell.displayName = 'LeaderListTableCell'
