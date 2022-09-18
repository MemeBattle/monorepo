import { createTheme, responsiveFontSizes } from '@memebattle/ui'
import { palette } from './palette'

export const ligrettoAuthTheme = responsiveFontSizes(
  createTheme({
    palette,
  }),
)
