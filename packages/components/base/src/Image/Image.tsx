import * as React from 'react'

export interface Image {
  className?: string
  src: string
  alt?: string
}

export const Image = (restProps: Image) => React.createElement('img', restProps)
