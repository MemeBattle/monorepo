import { createTheme, responsiveFontSizes } from '@memebattle/ui'
import { palette } from './palette'

export const theme = responsiveFontSizes(
  createTheme({
    palette,
    components: {
      MuiPaper: {
        styleOverrides: {
          root: {
            boxShadow: '0px 0px 32px rgba(0, 0, 0, 0.15)',
          },
          rounded: {
            borderRadius: '0.5rem',
          },
        },
      },
    },
  }),
)
