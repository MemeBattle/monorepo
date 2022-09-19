import React from 'react'
import { Box } from '@memebattle/ui'
import { styled } from '@mui/material/styles'

import fallbackAvatar from './assets/u1.svg'

export type AvatarSize = 'small' | 'medium' | 'large' | 'auto'

export const maxSizeBySize: Record<AvatarSize, string> = {
  small: '1.5rem',
  medium: '7.5rem',
  large: '10rem',
  auto: '100%',
}

export interface AvatarProps {
  src?: string
  size?: AvatarSize
  alt?: string
}

const StyledImage = styled('img')(() => ({
  objectFit: 'contain',
}))

export const Avatar: React.FC<AvatarProps> = ({ src, size = 'medium', alt = 'Avatar' }) => (
  <Box maxWidth={maxSizeBySize[size]} maxHeight={maxSizeBySize[size]} height={maxSizeBySize[size]}>
    <StyledImage alt={alt} src={src || fallbackAvatar} height="100%" width="100%" />
  </Box>
)
