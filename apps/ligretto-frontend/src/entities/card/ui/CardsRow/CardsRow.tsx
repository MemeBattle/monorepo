import type { ReactNode, Ref } from 'react'
import { Stack, useMediaQuery, useTheme } from '@memebattle/ui'

export const CardsRow = ({ children, ref }: { children: ReactNode; ref?: Ref<HTMLDivElement> }) => {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'))

  return (
    <Stack ref={ref} direction="row" sx={{ alignItems: 'flex-start' }} spacing={isMobile ? '2px' : 0.75}>
      {children}
    </Stack>
  )
}
