import React, { ViewTransition } from 'react'
import { LoaderCards, Box, useMediaQuery, useTheme } from '@memebattle/ui'

import { MainLayout } from '#shared/ui/layouts/main'

import { LigrettoLogo } from '#shared/ui/LigrettoLogo'

export const LoaderScreen: React.FC = () => {
  const theme = useTheme()

  const isMobile = useMediaQuery(theme.breakpoints.down('sm'))

  return (
    <ViewTransition exit={isMobile ? 'loader-screen-slide-up' : 'auto'}>
      <MainLayout>
        <Box overflow="hidden" display="flex" flexDirection="column" height="100%" sx={{ justifyItems: 'center', alignItems: 'center' }}>
          <Box display="flex" flex={1} minHeight="15rem" alignSelf="stretch">
            <LigrettoLogo />
          </Box>
          {isMobile ? null : (
            <Box flex={1} display="flex" width="100%">
              <LoaderCards />
            </Box>
          )}
        </Box>
      </MainLayout>
    </ViewTransition>
  )
}

LoaderScreen.displayName = 'LoaderScreen'
