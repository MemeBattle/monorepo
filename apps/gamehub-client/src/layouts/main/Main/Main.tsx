'use client'

import type { FC, ReactNode } from 'react'
import { Box } from '@memebattle/ui'

export const Main: FC<{ children: ReactNode }> = ({ children }) => (
  <Box flex={1} component="main">
    {children}
  </Box>
)
