import React from 'react'
import { getRandomAvatar } from './getRandomAvatar'
import { createStyles, makeStyles } from '@material-ui/core'

export type AvatarSize = 'small' | 'medium' | 'large' | 'auto'

export const maxSizeBySize: Record<AvatarSize, string> = {
  small: '70px',
  medium: '140px',
  large: '210px',
  auto: '100%',
}

export interface AvatarProps {
  src?: string
  size?: AvatarSize
  alt?: string
}

const useStyles = makeStyles(
  createStyles({
    boxImage: {
      maxWidth: ({ size }: { size: AvatarSize }) => maxSizeBySize[size],
      maxHeight: ({ size }: { size: AvatarSize }) => maxSizeBySize[size],
    },
  }),
)

export const Avatar: React.FC<AvatarProps> = ({ src, size = 'medium', alt = 'Avatar' }) => {
  const classes = useStyles({ size })
  return (
    <div className={classes.boxImage}>
      <img alt={alt} src={src ? src : getRandomAvatar()} height="100%" width="100%" />
    </div>
  )
}
