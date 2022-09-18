import { createTheme, responsiveFontSizes } from '@memebattle/ui'
import { palette } from './palette'

export const theme = responsiveFontSizes(
  createTheme({
    palette,
  }),
)
