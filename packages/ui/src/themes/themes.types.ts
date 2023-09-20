export type { Palette } from '@mui/material/styles'

type RGB = `rgb(${number}, ${number}, ${number})`
type RGBA = `rgba(${number}, ${number}, ${number}, ${number})`
type HEX = `#${string}`

type Color = RGB | RGBA | HEX

declare module '@mui/material/styles' {
  interface TypeBackground {
    light?: Color
    lighter?: Color
  }

  interface PaletteColor {
    lighter?: Color
    inactiveLight?: Color
  }
}
