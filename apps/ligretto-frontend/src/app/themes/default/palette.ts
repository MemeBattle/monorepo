import type { Palette } from '@memebattle/ui'

export const palette: Partial<Palette> = {
  primary: {
    main: '#2D8A53',
    dark: '#377757',
    lighter: '#33BE6D',
    light: '#40DD82',
    contrastText: '#fff',
    inactiveLight: '#2FB166',
  },
  secondary: {
    main: '#FFD31A',
    light: '#FFE36B',
    dark: '#E6BC00',
    contrastText: '#242625',
  },
  warning: {
    main: '#F9AA8D',
    light: '#FCBC85',
    dark: '#F7945E',
    contrastText: '#242625',
  },
  background: {
    default: '#247044',
    lighter: '#2C7D4E',
    paper: '#2CAB61',
  },
  text: {
    primary: '#fff',
    secondary: '#fff',
    disabled: 'rgba(255,255,255, 0.5)',
  },
}
