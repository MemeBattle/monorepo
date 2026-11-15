import type { FC, PropsWithChildren } from 'react'
import { Box } from '@memebattle/ui'

export const PlayersScoresTableHead: FC<PropsWithChildren> = ({ children }) => <Box sx={{ px: 2, pb: 1 }}>{children}</Box>

PlayersScoresTableHead.displayName = 'PlayersScoresTableHead'
