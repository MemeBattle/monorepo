import React from 'react'
import type { BoxProps } from '@memebattle/ui'
import { Box } from '@memebattle/ui'
import image from '../../../../assets/images/noisy-texture.png'

export const BaseLayout = (props: BoxProps) => (
  <Box component="main" display="flex" flex={1} flexDirection="column" width="100%" height="100vh" background={`url(${image})`} {...props} />
)
