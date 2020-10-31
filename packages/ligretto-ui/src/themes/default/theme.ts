import { createMuiTheme } from '@material-ui/core/styles'
import { palette } from './palette'
import { typography, segoeUI } from './typography'

export const theme = createMuiTheme({
  palette,
  typography,
  overrides: {
    MuiCssBaseline: {
      '@global': {
        '@font-face': [segoeUI],
      },
    },
  },
})
