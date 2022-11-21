import * as React from 'react'
import { Box } from '@memebattle/ui'

import { MainLayout } from 'components/layouts/main'
import { LinkBack } from 'components/base/link-back'
import { RoomsManager } from 'components/blocks/home/RoomsManager'

export const RoomsManagerPage = () => (
  <MainLayout>
    <Box display="flex" flexDirection="column" justifyContent="space-between" height="100%" alignItems="center" p={[0, 2]}>
      <Box p={1}>
        <RoomsManager />
      </Box>
      <Box textAlign="left" mb={2} ml={2} width="100%">
        <LinkBack />
      </Box>
    </Box>
  </MainLayout>
)
