import { createTheme } from '@mui/material/styles'

export const gamehubClientTheme = createTheme({
  palette: {
    mode: 'dark',
    background: {
      default: '#050D32',
      light: '#212756',
    },
    primary: {
      main: '#fff',
    },
  },
})

declare module '@mui/material/styles' {
  interface TypeBackground {
    light?: `#${string}`
  }
}
