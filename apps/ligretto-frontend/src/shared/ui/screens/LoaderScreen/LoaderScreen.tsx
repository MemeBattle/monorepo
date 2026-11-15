import React, { ViewTransition } from 'react'
import { LoaderCards, Box, useMediaQuery, useTheme } from '@memebattle/ui'

import { MainLayout } from '#shared/ui/layouts/main'

import { LigrettoLogo, LIGRETTO_LOGO_ASPECT_RATIO, LIGRETTO_LOGO_VIEW_TRANSITION_NAME } from '#shared/ui/LigrettoLogo'

// The logo is sized from its box, not left to the SVG: a percentage width inside a shrink-to-fit box resolves to
// 300px in Firefox and to the height-derived width in Chrome. A tight box also keeps the view transition to the home
// page from morphing empty space.
const logoStyle = { width: `min(100cqw, 100cqh * ${LIGRETTO_LOGO_ASPECT_RATIO})` }

export const LoaderScreen: React.FC = () => {
  const theme = useTheme()

  const isMobile = useMediaQuery(theme.breakpoints.down('sm'))

  return (
    <MainLayout>
      <Box overflow="hidden" display="flex" flexDirection="column" height="100%" sx={{ justifyItems: 'center', alignItems: 'center' }}>
        <Box display="flex" flex={1} minHeight="15rem" alignSelf="stretch" alignItems="center" justifyContent="center" sx={{ containerType: 'size' }}>
          <ViewTransition name={LIGRETTO_LOGO_VIEW_TRANSITION_NAME}>
            <LigrettoLogo style={logoStyle} />
          </ViewTransition>
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
