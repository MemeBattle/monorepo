import React from 'react'

export enum AvatarSize {
  Small = 'small',
  Medium = 'medium',
  Large = 'large',
}

const heightBySize = {
  [AvatarSize.Small]: '70px',
  [AvatarSize.Medium]: '140px',
  [AvatarSize.Large]: '210px',
}

interface Avatar {
  src: string
  size?: AvatarSize
}

export const Avatar: React.FC<Avatar> = ({ src, size = AvatarSize.Medium }) => <img alt="avatar" src={src} height={heightBySize[size]} />
