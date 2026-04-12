import React from 'react'

import { MainLayout } from '#shared/ui/layouts/main/MainLayout'
import { UserInfoContainer } from '#widgets/user-info'
import { Grid, Box } from '@memebattle/ui'
import { LigrettoLogo } from '#shared/ui/LigrettoLogo'
import { RoomsManager } from '#widgets/rooms-manager'

export const HomePage: React.FC = () => (
  <MainLayout>
    <Box sx={{ mx: { xs: 1, sm: 2, md: 10 }, my: { xs: 1, sm: 2, md: 5 } }}>
      <Grid sx={{ justifyContent: 'space-between' }} rowSpacing={{ xs: 1, sm: 2, md: 5 }} spacing={4} container>
        <Grid sx={{ display: 'flex' }} size={{ xs: 12, sm: 6 }}>
          <Box maxHeight="13rem" display="flex" flex={1}>
            <LigrettoLogo />
          </Box>
        </Grid>
        <Grid size={{ xs: 12, sm: 6, lg: 4 }}>
          <UserInfoContainer />
        </Grid>
        <Grid size={{ xs: 12 }}>
          <RoomsManager></RoomsManager>
        </Grid>
      </Grid>
    </Box>
  </MainLayout>
)
