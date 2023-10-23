import React from 'react'
import type { BoxProps } from '@memebattle/ui'
import { useMediaQuery, useTheme, Box } from '@memebattle/ui'

import textureLarge from './assets/background-large-texture.png'
import textureSmall from './assets/background-small-texture.png'

export const BaseLayout = (props: BoxProps) => {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'))
  return (
    <Box
      component="main"
      display="flex"
      flex={1}
      flexDirection="column"
      width="100%"
      height="100vh"
      style={{ backgroundImage: `url(${!isMobile ? textureLarge : textureSmall}` }}
      {...props}
    />
  )
}
