import React, { ViewTransition } from 'react'

import { MainLayout } from '#shared/ui/layouts/main/MainLayout'
import { UserInfoContainer } from '#widgets/user-info'
import { Grid, Box } from '@memebattle/ui'
import { LigrettoLogo, LIGRETTO_LOGO_ASPECT_RATIO, LIGRETTO_LOGO_VIEW_TRANSITION_NAME } from '#shared/ui/LigrettoLogo'
import { RoomsManager } from '#widgets/rooms-manager'
import { LeaderBoard } from '#features/leader-board'

// The SVG box hugs the logo, so the view transition from the loader screen morphs the logo and not empty space.
const logoStyle = { width: `min(100%, 13rem * ${LIGRETTO_LOGO_ASPECT_RATIO})` }

export const HomePage: React.FC = () => (
  <MainLayout>
    <Box sx={{ mx: { xs: 1, sm: 2, md: 10 }, my: { xs: 1, sm: 2, md: 5 } }}>
      <Grid sx={{ justifyContent: 'space-between' }} rowSpacing={{ xs: 1, sm: 2, md: 5 }} spacing={4} container>
        <Grid sx={{ display: 'flex' }} size={{ xs: 12, sm: 6 }}>
          <Box display="flex" flex={1} alignItems="center" justifyContent="center">
            <ViewTransition name={LIGRETTO_LOGO_VIEW_TRANSITION_NAME}>
              <LigrettoLogo style={logoStyle} />
            </ViewTransition>
          </Box>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 4 }}>
          <UserInfoContainer />
        </Grid>
        <Grid size={{ xs: 12 }}>
          <RoomsManager></RoomsManager>
        </Grid>
        <Grid size={{ xs: 12 }}>
          <LeaderBoard />
        </Grid>
      </Grid>
    </Box>
  </MainLayout>
)
