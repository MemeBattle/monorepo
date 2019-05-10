import * as React from 'react'

export interface IImage {
  className?: string
  src: string
  alt?: string
}

export const Image = (restProps: IImage) => {
  return React.createElement('img', restProps)
}
