import { styled } from '@mui/material/styles'
import { BaseLayout } from '../base/BaseLayout'

export const GameLayout = styled(BaseLayout)(({ height }) => ({
  '@supports (height: 1dvh)': { height: `${height}dvh` },
  '@supports not (height: 1dvh)': { height: `${height}vh` },
}))
