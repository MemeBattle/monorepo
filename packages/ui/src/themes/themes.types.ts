import type { Palette } from '@mui/material/styles'

type RGB = `rgb(${number}, ${number}, ${number})`
type RGBA = `rgba(${number}, ${number}, ${number}, ${number})`
type HEX = `#${string}`

type Color = RGB | RGBA | HEX

export type PaletteV5 = Palette & {
  text: { hint: string }
}

declare module '@mui/material/styles' {
  interface TypeBackground {
    light?: Color
    lighter?: Color
  }

  interface PaletteColor {
    lighter?: Color
  }
}
