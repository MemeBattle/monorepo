import { createTheme, adaptV4Theme } from '@mui/material/styles'
import { palette } from './palette'
import type { Theme } from '@mui/material/styles'

declare module '@mui/styles' {
  // eslint-disable-next-line
  interface DefaultTheme extends Theme {}
}

export const theme = createTheme(
  adaptV4Theme({
    palette,
    breakpoints: {
      values: {
        xs: 0,
        sm: 600,
        md: 960,
        lg: 1280,
        xl: 1920,
      },
    },
  }),
)
