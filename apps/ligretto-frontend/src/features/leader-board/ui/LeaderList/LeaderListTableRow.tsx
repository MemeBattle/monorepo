import type { BoxProps } from '@memebattle/ui'
import { Box } from '@memebattle/ui'

export const LeaderListTableRow = (props: BoxProps) => (
  <Box borderRadius={1} sx={{ px: { xs: 1, sm: 2 }, py: 1 }} data-test-id="LeaderBoard-Row" {...props} />
)

LeaderListTableRow.displayName = 'LeaderListTableRow'
