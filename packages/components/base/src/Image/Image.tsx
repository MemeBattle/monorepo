import * as React from 'react'

export interface Image {
  className?: string
  src: string
  alt?: string
}

export const Image = (restProps: IImage) => React.createElement('img', restProps)
