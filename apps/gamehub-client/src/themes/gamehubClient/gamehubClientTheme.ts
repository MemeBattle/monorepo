import { createTheme } from '@mui/material/styles'

export const gamehubClientTheme = createTheme({
  palette: {
    mode: 'dark',
    background: {
      default: '#050D32',
      light: '#1C2550',
      lighter: '#212756',
    },
    primary: {
      main: '#F3DD0E',
    },
    secondary: {
      main: '#fff',
    },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: { display: 'flex', flexDirection: 'column', minHeight: '100vh' },
      },
    },
  },
})
