import React from 'react'
import { LoaderCards, Box, useMediaQuery, useTheme } from '@memebattle/ui'

import { MainLayout } from 'components/layouts/main'

import { LigrettoLogo } from 'components/LigrettoLogo'

export const LoaderScreen: React.FC = () => {
  const theme = useTheme()

  const isMobile = useMediaQuery(theme.breakpoints.down('sm'))

  return (
    <MainLayout>
      <Box display="flex" flexDirection="column" justify-items="center" align-items="center" height="100%">
        <Box flex={1} minHeight="15rem">
          <LigrettoLogo />
        </Box>
        {isMobile ? null : (
          <Box flex={1} display="flex" width="100%">
            <LoaderCards />
          </Box>
        )}
      </Box>
    </MainLayout>
  )
}

LoaderScreen.displayName = 'LoaderScreen'
