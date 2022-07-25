import type { Palette } from '@mui/material/styles'

export type PaletteV5 = Palette & {
  text: { hint: string }
}

declare module '@mui/material/styles' {
  interface TypeBackground {
    light?: `#${string}`
    lighter?: `#${string}`
  }
}
