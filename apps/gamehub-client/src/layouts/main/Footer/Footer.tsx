import { Box, useTheme, MemebattleLogo } from '@memebattle/ui'

export const Footer = () => {
  const theme = useTheme()

  return (
    <Box component="footer" display="flex" justifyContent="end" padding={theme.spacing(2)} height={theme.spacing(16)}>
      <Box alignSelf="center" width={theme.spacing(10)}>
        <MemebattleLogo />
      </Box>
    </Box>
  )
}
