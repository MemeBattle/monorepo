'use client'

import { Button, Box, useTheme } from '@memebattle/ui'
import type { LinkProps } from 'next/link'
import Link from 'next/link'
import type { FC, ReactNode } from 'react'

const HeaderButton: FC<{ children: ReactNode; isDisabled?: boolean } & LinkProps> = ({ children, href, isDisabled }) => (
  <Button component={Link} href={href as string} color="secondary" disabled={isDisabled}>
    {children}
  </Button>
)
export const Header = () => {
  const theme = useTheme()

  return (
    <Box component="header" display="flex" alignItems="center" justifyContent="center" height={theme.spacing(16)} maxHeight={theme.spacing(16)}>
      <Box>
        <HeaderButton href="/">Home</HeaderButton>
        <HeaderButton href="https://blog.mems.fun">Blog</HeaderButton>
        <HeaderButton href="/contacts" isDisabled>
          Contacts
        </HeaderButton>
      </Box>
    </Box>
  )
}
