import type { Palette } from '@material-ui/core/styles/createPalette'

export const palette: Partial<Palette> = {
  primary: {
    main: '#2D8A53',
    dark: '#377757',
    light: '#afe3c9',
    contrastText: '#fff',
  },
  background: {
    default: '#33905A',
    paper: '#fff',
  },
  text: {
    primary: '#2D8A53',
    secondary: '#377757',
    disabled: 'rgba(255,255,255, 0.5)',
    hint: '#888',
  },
}
