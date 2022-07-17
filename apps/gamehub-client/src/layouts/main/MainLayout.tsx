import type { FC, ReactNode } from 'react'
import { Header } from './Header'
import { Footer } from './Footer'
import { Box } from '@memebattle/ui'

export const MainLayout: FC<{ children: ReactNode }> = ({ children }) => (
  <Box display="flex" flexDirection="column" minHeight="100vh">
    <Header />
    <Box component="main" flex={1}>
      {children}
    </Box>
    <Footer />
  </Box>
)
