import { Button, Box, useTheme } from '@memebattle/ui'
import type { FC, ReactNode } from 'react'

const HeaderButton: FC<{ children: ReactNode }> = ({ children }) => <Button>{children}</Button>

export const Header = () => {
  const theme = useTheme()

  return (
    <Box component="header" display="flex" alignItems="center" justifyContent="center" height={theme.spacing(16)} maxHeight={theme.spacing(16)}>
      <Box>
        <HeaderButton>Home</HeaderButton>
        <HeaderButton>Blog</HeaderButton>
        <HeaderButton>Contacts</HeaderButton>
      </Box>
    </Box>
  )
}
