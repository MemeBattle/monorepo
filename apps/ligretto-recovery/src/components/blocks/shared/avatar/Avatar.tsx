import React from 'react'

const heightBySize = {
  small: '70px',
  medium: '140px',
  large: '210px',
}

interface Avatar {
  src: string
  size?: keyof typeof heightBySize
}

const Avatar: React.FC<Avatar> = ({ src, size = 'medium' }) => <img alt="avatar" src={src} height={heightBySize[size]} />

export default Avatar
