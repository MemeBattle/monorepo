import type { ReactNode } from 'react'
import React from 'react'
import { Stack, useMediaQuery, useTheme } from '@memebattle/ui'

export const CardsRow = ({ children }: { children: ReactNode }) => {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'))

  return (
    <Stack direction="row" alignItems="flex-start" spacing={isMobile ? '2px' : 0.75}>
      {children}
    </Stack>
  )
}

CardsRow.displayName = 'CardsRow'
