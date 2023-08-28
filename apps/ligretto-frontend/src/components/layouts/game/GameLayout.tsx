import { styled } from '@mui/material/styles'
import { BaseLayout } from '../base/BaseLayout'

export const GameLayout = styled(BaseLayout)(() => ({ height: '100vh', '@supports (height: 1dvh)': { height: '100dvh' } }))
