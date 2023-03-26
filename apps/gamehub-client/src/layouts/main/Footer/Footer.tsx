'use client'
import Image from 'next/image'

import gitHubLogo from './GitHub_Logo_White.png'
import { Box, useTheme, MemebattleLogo } from '@memebattle/ui'

export const Footer = () => {
  const theme = useTheme()

  return (
    <Box component="footer" display="flex" padding={theme.spacing(2)} height={theme.spacing(16)}>
      <Box display="flex" alignItems="center" justifyContent="center" flex={1}>
        <a href="https://github.com/MemeBattle/monorepo">
          <Image width="180" alt="GitHub" src={gitHubLogo} />
        </a>
      </Box>
      <Box alignSelf="center" width={theme.spacing(10)}>
        <MemebattleLogo />
      </Box>
    </Box>
  )
}
