import React from 'react'
import { Box } from '@memebattle/components-base'

export interface CircleImage {
  src: string
  className?: string
}

export const CircleImage: React.FC<ICircleImage> = ({ src, ...props }) => (
  <Box
    style={{
      backgroundImage: `url(${src})`,
      backgroundSize: 'cover',
      borderRadius: '50%',
    }}
    {...props}
  />
)
