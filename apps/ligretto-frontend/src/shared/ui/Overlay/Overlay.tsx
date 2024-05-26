import { styled } from '@mui/material/styles'

export const Overlay = styled('div')(() => ({
  width: '100%',
  height: '100%',
  backdropFilter: 'blur(8px)',
  backgroundColor: 'rgba(255, 255, 255, 0.4)',
  position: 'absolute',
}))
