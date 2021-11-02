import React, { useMemo } from 'react'
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
      height: ({ size }: { size: AvatarSize }) => maxSizeBySize[size],
    },
    image: {
      objectFit: 'contain',
    },
  }),
)

export const Avatar: React.FC<AvatarProps> = ({ src, size = 'medium', alt = 'Avatar' }) => {
  const classes = useStyles({ size })
  const source = useMemo(() => (src ? src : getRandomAvatar()), [src])
  return (
    <div className={classes.boxImage}>
      <img className={classes.image} alt={alt} src={source} height="100%" width="100%" />
    </div>
  )
}
