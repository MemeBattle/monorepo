import { createTheme, adaptV4Theme } from '@mui/material/styles'
import { palette } from './palette'
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
