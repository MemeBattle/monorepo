import type { FC, ReactNode } from 'react'
import { Box, Typography } from '@memebattle/ui'
import { alpha } from '@mui/material/styles'

export const NameBadge: FC<{ children: ReactNode; isAccent?: boolean }> = ({ children, isAccent }) => (
  <Box
    component="span"
    display="inline-flex"
    alignItems="center"
    sx={{
      flexShrink: 0,
      px: 1,
      py: 0.25,
      borderRadius: 999,
      color: isAccent ? 'secondary.contrastText' : 'text.primary',
      bgcolor: theme => (isAccent ? theme.palette.secondary.main : alpha(theme.palette.common.black, 0.35)),
    }}
  >
    <Typography component="span" variant="caption" fontWeight={700} sx={{ lineHeight: 1.4 }}>
      {children}
    </Typography>
  </Box>
)

NameBadge.displayName = 'NameBadge'
